// probe.swift — a Studio's page driven in a WKWebView, the engine its own window uses, with nothing to
// look at: the window is all but transparent, takes no clicks and never comes to the front. A Studio is
// tested in headless Chrome (its selftest), but the window people use is WebKit: another JavaScript
// engine, another CSS, another WebGL. This runs a list of steps there and says what broke.
//
//   swiftc -O probe.swift -o /tmp/studio-probe
//   /tmp/studio-probe <url> <steps.json> <outDir>
//
// steps.json is a list, run in order, each one of:
//   { "wait": 2.5 }                      seconds
//   { "load": "/studio/stage.html#…" }   another page of the same server
//   { "js": "…; return '…'", "label": "…" }   an async function body run in the page; what it returns is
//                                        printed (return a string: JSON.stringify what you measure)
//   { "snap": "name" }                   <outDir>/name.png, the page as WebKit painted it
// Every error, unhandled rejection, console.error and console.warn of the page is collected in
// window.__errs: return it from a js step. It ends by printing DONE.
//
// Traps:
// - A page that says goodbye to its server when it is left (the Studio's wizard does, on pagehide,
//   and its server then closes 5 s later) takes the server with it: after the wizard, `load` steps work
//   for five seconds and then silently keep the old page. Start the server again and give this the
//   other page as its <url>, without opening the wizard first.
// - `load` returns before the page is there, and a js step run too early runs in the page being left:
//   wait after a load, and have the step return location.search, so a stale page shows.
// - A window fully hidden has its timers and frames slowed by WebKit: this one is on screen at 2 %
//   opacity. With the display asleep the frames stop all the same; scripts and snapshots still work.
import Cocoa
import WebKit

struct Step: Decodable { let wait: Double?; let js: String?; let snap: String?; let load: String?; let label: String? }

final class Probe: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let steps: [Step]
    var i = 0
    let out: String
    let base: URL
    init(base: URL, steps: [Step], out: String) { self.base = base; self.steps = steps; self.out = out }

    func applicationDidFinishLaunching(_ n: Notification) {
        let config = WKWebViewConfiguration()
        let capture = """
        window.__errs = [];
        window.addEventListener('error', (e) => window.__errs.push(String(e.message) + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
        window.addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + String(e.reason && e.reason.message || e.reason)));
        const ce = console.error.bind(console); console.error = (...a) => { window.__errs.push('console.error: ' + a.map(String).join(' ')); ce(...a); };
        const cw = console.warn.bind(console); console.warn = (...a) => { window.__errs.push('console.warn: ' + a.map(String).join(' ')); cw(...a); };
        """
        config.userContentController.addUserScript(WKUserScript(source: capture, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1480, height: 940), configuration: config)
        window = NSWindow(contentRect: NSRect(x: 40, y: 40, width: 1480, height: 940), styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = web
        window.alphaValue = 0.02
        window.ignoresMouseEvents = true
        window.orderFrontRegardless()
        web.load(URLRequest(url: base))
        next(0)
    }
    func next(_ after: Double) { DispatchQueue.main.asyncAfter(deadline: .now() + after) { self.run() } }
    func run() {
        guard i < steps.count else { print("DONE"); exit(0) }
        let s = steps[i]; i += 1
        if let w = s.wait { next(w); return }
        if let l = s.load { web.load(URLRequest(url: URL(string: l, relativeTo: base)!)); next(0.2); return }
        if let name = s.snap {
            web.takeSnapshot(with: WKSnapshotConfiguration()) { img, err in
                if let img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
                    // a snapshot that could not be written is said, never counted as taken
                    do { try png.write(to: URL(fileURLWithPath: self.out + "/" + name + ".png")); print("SNAP \(name)") }
                    catch { print("SNAP \(name) failed: \(error.localizedDescription)") }
                } else { print("SNAP \(name) failed: \(String(describing: err))") }
                self.next(0)
            }
            return
        }
        if let js = s.js {
            web.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
                switch result {
                case .success(let v): print("JS \(s.label ?? "") → \(v)")
                case .failure(let e): print("JS \(s.label ?? "") FAILED: \(e)")
                }
                self.next(0)
            }
            return
        }
        next(0)
    }
}
let args = CommandLine.arguments
guard args.count >= 4 else { print("usage: probe <url> <steps.json> <outDir>"); exit(2) }
try FileManager.default.createDirectory(atPath: args[3], withIntermediateDirectories: true) // the snapshots' folder, made if it is not there
let steps = try JSONDecoder().decode([Step].self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let probe = Probe(base: URL(string: args[1])!, steps: steps, out: args[3])
app.delegate = probe
app.run()
