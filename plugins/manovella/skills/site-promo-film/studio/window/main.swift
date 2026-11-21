// Studio Window: one Studio's page in a window of its own, so it shows up in the Dock and the app
// switcher under its own name and icon instead of as one more Google Chrome. It is a window and nothing
// else: the Studio's server serves the page and decides when the session is over. build.sh makes one app
// per Studio from this file, with that Studio's name, icon and settings in its Info.plist.
//
//   <Name>.app/Contents/MacOS/<Name> --url http://127.0.0.1:<port>/?k=<key>
//
// The Studio spawns this binary where it spawned Chrome, and ends it the same way (SIGTERM); closing the
// window quits the app, which the Studio reads as the window closing, as it did Chrome's exit.
//
// - Only the 127.0.0.1 origin it was given loads inside; any other link opens in the default browser.
// - While it is open it GETs <origin><SWPingPath>?k=<key> every 10 s itself (Info.plist; none when the
//   key is empty): WebKit slows a hidden window's timers, and a page that keeps the server alive by
//   itself could let it time out once the window is behind another one.
// - Three pings in a row that get no answer mean the server is gone (killed, crashed): the app quits
//   rather than show a dead page.
// - Opened from the Dock or Spotlight with no --url, it says how the Studio is opened (SWHint) and waits.
import Cocoa
import WebKit

let info = Bundle.main.infoDictionary ?? [:]
let appName = info["CFBundleName"] as? String ?? "Studio"
let pingPath = info["SWPingPath"] as? String ?? ""
let hint = info["SWHint"] as? String ?? "This window opens from its Studio."
let size = NSSize(width: info["SWWidth"] as? Double ?? 1360, height: info["SWHeight"] as? Double ?? 900)
// "dark" or "light" fixes the window's appearance, its title bar and the page's prefers-color-scheme
// alike, for a Studio drawn in one scheme only; absent, it follows the Mac's.
let appearance: NSAppearance? = {   // a statement, not a switch expression: Swift 5.8 (Xcode 14.3) builds it too
    switch info["SWAppearance"] as? String {
    case "dark": return NSAppearance(named: .darkAqua)
    case "light": return NSAppearance(named: .aqua)
    default: return nil
    }
}()
// App-menu items the page answers itself: each sends a `studio:menu` event with its id. "about" takes the
// place of the system's About panel; the others follow it, with their title and key (⌘ plus it).
struct PageItem { let id, title, key: String }
let pageItems: [PageItem] = (info["SWPageItems"] as? [[String: Any]] ?? []).compactMap { d in
    guard let id = d["id"] as? String, id.range(of: "^[a-z0-9-]+$", options: .regularExpression) != nil else { return nil }
    return PageItem(id: id, title: d["title"] as? String ?? id, key: d["key"] as? String ?? "")
}

final class StudioWindow: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var web: WKWebView!
    private var origin: URL?           // the studio's scheme, host and port: what may load inside
    private var key: String?
    private var misses = 0
    private var titleWatch: NSKeyValueObservation?
    private var activity: NSObjectProtocol?

    func applicationDidFinishLaunching(_ note: Notification) {
        if let appearance { NSApp.appearance = appearance }
        buildMenu()
        buildWindow()
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--url"), i + 1 < args.count, let u = URL(string: args[i + 1]), u.scheme == "http", u.host == "127.0.0.1" {
            show(u)
        } else {
            web.loadHTMLString(message(hint), baseURL: nil)
        }
        // App Nap would slow the ping as much as WebKit slows the page.
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiatedAllowingIdleSystemSleep], reason: "The Studio's window keeps its server alive")
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        return true
    }

    // ------------------------------------------------------------ the window
    private func buildWindow() {
        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground")   // no white flash before the page paints
        if #available(macOS 13.3, *) { web.isInspectable = true }   // Safari ▸ Develop, for a page that misbehaves here only
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = appName
        window.minSize = NSSize(width: 900, height: 600)
        window.contentView = web
        window.delegate = self
        window.center()
        window.setFrameAutosaveName(appName)
        window.makeKeyAndOrderFront(nil)
        titleWatch = web.observe(\.title, options: [.new]) { [weak self] view, _ in
            if let t = view.title, !t.isEmpty { self?.window.title = t }
        }
    }

    private func show(_ u: URL) {
        var c = URLComponents(url: u, resolvingAgainstBaseURL: false)
        key = c?.queryItems?.first(where: { $0.name == "k" })?.value
        c?.path = ""
        c?.query = nil
        c?.fragment = nil
        origin = c?.url
        web.load(URLRequest(url: u))
        if !pingPath.isEmpty, key != nil {
            Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.ping() }
        }
    }

    private func message(_ text: String) -> String {
        let safe = text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
        return """
        <!doctype html><meta charset="utf-8"><title>\(appName)</title><style>
        :root { color-scheme: light dark; } body { margin: 0; height: 100vh; display: grid; place-items: center;
        font: 13px system-ui; color: #6e6e78; background: #f5f5f7; text-align: center; padding: 0 48px; box-sizing: border-box; }
        @media (prefers-color-scheme: dark) { body { background: #0a0a0b; color: #a0a0ab; } }
        </style><p>\(safe)</p>
        """
    }

    // ------------------------------------------------------------ the heartbeat
    private func ping() {
        guard let origin, let key, var c = URLComponents(url: origin, resolvingAgainstBaseURL: false) else { return }
        c.path = pingPath
        c.queryItems = [URLQueryItem(name: "k", value: key)]
        guard let url = c.url else { return }
        URLSession.shared.dataTask(with: URLRequest(url: url, timeoutInterval: 5)) { [weak self] _, response, _ in
            let answered = response is HTTPURLResponse
            DispatchQueue.main.async {
                guard let self else { return }
                self.misses = answered ? 0 : self.misses + 1
                if self.misses >= 3 { NSApp.terminate(nil) }   // nobody serves the page any more
            }
        }.resume()
    }

    // ------------------------------------------------------------ navigation: the studio stays in, the rest goes out
    private func inside(_ u: URL) -> Bool {
        u.scheme == "about" || u.scheme == "blob" || u.scheme == "data" || (u.host == origin?.host && u.port == origin?.port && u.scheme == origin?.scheme)
    }

    func webView(_ v: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler done: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let u = a.request.url else { return done(.cancel) }
        if a.shouldPerformDownload { return done(.download) }
        if inside(u) || a.targetFrame?.isMainFrame == false && u.scheme == "about" { return done(.allow) }
        if ["http", "https", "mailto"].contains(u.scheme ?? "") { NSWorkspace.shared.open(u) }
        done(.cancel)
    }

    func webView(_ v: WKWebView, decidePolicyFor r: WKNavigationResponse, decisionHandler done: @escaping (WKNavigationResponsePolicy) -> Void) {
        done(r.canShowMIMEType ? .allow : .download)
    }

    func webView(_ v: WKWebView, navigationAction a: WKNavigationAction, didBecome d: WKDownload) { d.delegate = self }
    func webView(_ v: WKWebView, navigationResponse r: WKNavigationResponse, didBecome d: WKDownload) { d.delegate = self }

    /// A download goes to ~/Downloads under its own name, never over a file already there.
    func download(_ d: WKDownload, decideDestinationUsing r: URLResponse, suggestedFilename name: String, completionHandler done: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        let base = (name as NSString).deletingPathExtension, ext = (name as NSString).pathExtension
        var url = dir.appendingPathComponent(name), n = 2
        while FileManager.default.fileExists(atPath: url.path) {
            url = dir.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)")
            n += 1
        }
        done(url)
    }

    func webView(_ v: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url, ["http", "https"].contains(u.scheme ?? "") { NSWorkspace.shared.open(u) }
        return nil
    }

    func webViewDidClose(_ v: WKWebView) { window.performClose(nil) }

    func webViewWebContentProcessDidTerminate(_ v: WKWebView) { v.reload() }

    // ------------------------------------------------------------ what a browser would ask
    func webView(_ v: WKWebView, runJavaScriptAlertPanelWithMessage text: String, initiatedByFrame f: WKFrameInfo, completionHandler done: @escaping () -> Void) {
        let a = NSAlert()
        a.messageText = text
        a.beginSheetModal(for: window) { _ in done() }
    }

    func webView(_ v: WKWebView, runJavaScriptConfirmPanelWithMessage text: String, initiatedByFrame f: WKFrameInfo, completionHandler done: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = text
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { r in done(r == .alertFirstButtonReturn) }
    }

    func webView(_ v: WKWebView, runJavaScriptTextInputPanelWithPrompt text: String, defaultText: String?, initiatedByFrame f: WKFrameInfo, completionHandler done: @escaping (String?) -> Void) {
        let a = NSAlert()
        a.messageText = text
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = defaultText ?? ""
        a.accessoryView = field
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { r in done(r == .alertFirstButtonReturn ? field.stringValue : nil) }
    }

    func webView(_ v: WKWebView, runOpenPanelWith p: WKOpenPanelParameters, initiatedByFrame f: WKFrameInfo, completionHandler done: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = p.allowsMultipleSelection
        panel.canChooseDirectories = p.allowsDirectories
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { r in done(r == .OK ? panel.urls : nil) }
    }

    // ------------------------------------------------------------ the menu
    private func buildMenu() {
        let bar = NSMenu()
        func item(_ title: String, _ action: Selector?, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
            i.keyEquivalentModifierMask = mods
            return i
        }
        let app = NSMenu()
        let about = item("About \(appName)", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), "")
        if pageItems.contains(where: { $0.id == "about" }) { about.action = #selector(pageItem(_:)); about.representedObject = "about" }
        app.addItem(about)
        let own = pageItems.filter { $0.id != "about" }
        if !own.isEmpty { app.addItem(.separator()) }
        for p in own { let i = item(p.title, #selector(pageItem(_:)), p.key); i.representedObject = p.id; app.addItem(i) }
        app.addItem(.separator())
        app.addItem(item("Hide \(appName)", #selector(NSApplication.hide(_:)), "h"))
        app.addItem(item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]))
        app.addItem(item("Show All", #selector(NSApplication.unhideAllApplications(_:)), ""))
        app.addItem(.separator())
        app.addItem(item("Quit \(appName)", #selector(NSApplication.terminate(_:)), "q"))
        let edit = NSMenu(title: "Edit")
        edit.addItem(item("Undo", Selector(("undo:")), "z"))
        edit.addItem(item("Redo", Selector(("redo:")), "z", [.command, .shift]))
        edit.addItem(.separator())
        edit.addItem(item("Cut", #selector(NSText.cut(_:)), "x"))
        edit.addItem(item("Copy", #selector(NSText.copy(_:)), "c"))
        edit.addItem(item("Paste", #selector(NSText.paste(_:)), "v"))
        edit.addItem(item("Select All", #selector(NSText.selectAll(_:)), "a"))
        let view = NSMenu(title: "View")
        view.addItem(item("Reload Page", #selector(reloadPage), "r", [.command, .option]))
        view.addItem(item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]))
        let win = NSMenu(title: "Window")
        win.addItem(item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"))
        win.addItem(item("Zoom", #selector(NSWindow.performZoom(_:)), ""))
        win.addItem(item("Close", #selector(NSWindow.performClose(_:)), "w"))
        for (title, menu) in [(appName, app), ("Edit", edit), ("View", view), ("Window", win)] {
            let top = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            top.submenu = menu
            bar.addItem(top)
        }
        NSApp.mainMenu = bar
        NSApp.windowsMenu = win
    }

    @objc private func reloadPage() { web.reload() }
    /// A page item: the page hears `studio:menu` with its id. Before a Studio's page is in the window
    /// (opened from the Dock) there is nobody to hear it: About is then the system's panel.
    @objc private func pageItem(_ sender: NSMenuItem) {
        guard let id = sender.representedObject as? String else { return }
        guard origin != nil else { if id == "about" { NSApp.orderFrontStandardAboutPanel(nil) }; return }
        window.makeKeyAndOrderFront(nil)
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('studio:menu', { detail: { id: '\(id)' } }))")
    }
}

signal(SIGTERM) { _ in exit(0) }   // the Studio ending the session: no "quit unexpectedly" report
let app = NSApplication.shared
let delegate = StudioWindow()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
