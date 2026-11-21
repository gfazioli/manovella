// Draws a Studio's 1024 px app icon: a glyph in white on a squircle in the Studio's colour, with one part
// of the glyph in a highlight colour. The glyph tells the Studios apart in the Dock at a glance, the
// colour matches the Studio's own accent.
//
//   swift make-icon.swift <glyph> <top> <bottom> <highlight> <out.png>
//
//   glyph      gauge | chat | cube | bars | film | bone, or svg:<file.svg> — a mark of the project's own (its
//              favicon, its logo), painted whole in the highlight colour and centred
//   top        the squircle's colour at the top, #rrggbb; bottom, the same at the bottom
//   highlight  the glyph's accent part: the gauge's needle, the chat's dots, the cube's top face,
//              the last bar, the film's play mark, the bone's long shadow; for an svg mark, its colour
//
// Run once per Studio, optimise the result (ImageOptim, when installed), and commit it beside the Studio as
// icon-1024.png; build.sh only turns it into an .icns.
import AppKit

let args = Array(CommandLine.arguments.dropFirst())
guard args.count == 5 else {
    FileHandle.standardError.write("usage: swift make-icon.swift <gauge|chat|cube|bars|film|bone|svg:file.svg> <top #rrggbb> <bottom #rrggbb> <highlight #rrggbb> <out.png>\n".data(using: .utf8)!)
    exit(2)
}
func color(_ hex: String) -> CGColor {
    let v = Int(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
    return NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1).cgColor
}
let (glyph, top, bottom, highlight, out) = (args[0], color(args[1]), color(args[2]), color(args[3]), args[4])
let white = NSColor.white.withAlphaComponent(0.96).cgColor

let size = 1024.0
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext

// the macOS icon grid: an 824-point body, 100 points in, a 185-point corner, a soft shadow under it
let body = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = CGPath(roundedRect: body, cornerWidth: 185, cornerHeight: 185, transform: nil)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -12), blur: 28, color: NSColor.black.withAlphaComponent(0.28).cgColor)
ctx.addPath(shape); ctx.setFillColor(bottom); ctx.fillPath()
ctx.restoreGState()
ctx.saveGState()
ctx.addPath(shape); ctx.clip()
let grad = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [top, bottom] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: body.maxY), end: CGPoint(x: 0, y: body.minY), options: [])

func stroke(_ path: CGPath, _ c: CGColor, _ width: CGFloat) {
    ctx.addPath(path); ctx.setStrokeColor(c); ctx.setLineWidth(width); ctx.setLineCap(.round); ctx.setLineJoin(.round); ctx.strokePath()
}
func fill(_ path: CGPath, _ c: CGColor) { ctx.addPath(path); ctx.setFillColor(c); ctx.fillPath() }
let rad = { (deg: CGFloat) in deg * .pi / 180 }

switch glyph {
case let g where g.hasPrefix("svg:"): // the mark, fitted in a 600-point box, keeping its proportions, in one colour
    guard let mark = NSImage(contentsOfFile: String(g.dropFirst(4))), mark.size.width > 0, mark.size.height > 0 else {
        FileHandle.standardError.write("cannot read the svg \(g.dropFirst(4))\n".data(using: .utf8)!)
        exit(2)
    }
    let box = 600.0, k = min(box / mark.size.width, box / mark.size.height)
    let r = CGRect(x: 512 - mark.size.width * k / 2, y: 512 - mark.size.height * k / 2, width: mark.size.width * k, height: mark.size.height * k)
    ctx.beginTransparencyLayer(auxiliaryInfo: nil)
    mark.draw(in: r)
    ctx.setBlendMode(.sourceIn) // keep the mark's shape, take the highlight's colour
    ctx.setFillColor(highlight); ctx.fill(r)
    ctx.endTransparencyLayer()
case "gauge": // a dial open at the bottom, and its needle
    let c = CGPoint(x: 512, y: 470)
    let arc = CGMutablePath(); arc.addArc(center: c, radius: 268, startAngle: rad(212), endAngle: rad(-32), clockwise: true)
    stroke(arc, white, 74)
    for deg in stride(from: 172.0, through: 8.0, by: -41.0) { // the scale's ticks, inside the dial
        let t = CGMutablePath()
        t.move(to: CGPoint(x: c.x + 178 * cos(rad(deg)), y: c.y + 178 * sin(rad(deg))))
        t.addLine(to: CGPoint(x: c.x + 206 * cos(rad(deg)), y: c.y + 206 * sin(rad(deg))))
        stroke(t, white.copy(alpha: 0.55)!, 26)
    }
    let needle = CGMutablePath(); needle.move(to: c); needle.addLine(to: CGPoint(x: c.x + 196 * cos(rad(52)), y: c.y + 196 * sin(rad(52))))
    stroke(needle, highlight, 58)
    fill(CGPath(ellipseIn: CGRect(x: c.x - 62, y: c.y - 62, width: 124, height: 124), transform: nil), highlight)
case "chat": // a speech bubble with three dots
    let bubble = CGMutablePath()
    bubble.addPath(CGPath(roundedRect: CGRect(x: 214, y: 352, width: 596, height: 430), cornerWidth: 168, cornerHeight: 168, transform: nil))
    bubble.move(to: CGPoint(x: 318, y: 420)); bubble.addLine(to: CGPoint(x: 262, y: 236)); bubble.addLine(to: CGPoint(x: 470, y: 380)); bubble.closeSubpath()
    fill(bubble, white)
    for x in [384.0, 512.0, 640.0] { fill(CGPath(ellipseIn: CGRect(x: x - 46, y: 567 - 46, width: 92, height: 92), transform: nil), highlight) }
case "cube": // a box seen from above a corner, its top face lit
    let c = CGPoint(x: 512, y: 500), s = 268.0, k = 0.866
    let p = (top: CGPoint(x: c.x, y: c.y + s), ur: CGPoint(x: c.x + k * s, y: c.y + s / 2), lr: CGPoint(x: c.x + k * s, y: c.y - s / 2),
             bottom: CGPoint(x: c.x, y: c.y - s), ll: CGPoint(x: c.x - k * s, y: c.y - s / 2), ul: CGPoint(x: c.x - k * s, y: c.y + s / 2))
    let face = CGMutablePath(); face.addLines(between: [p.top, p.ur, c, p.ul]); face.closeSubpath()
    fill(face, highlight)
    let edges = CGMutablePath(); edges.addLines(between: [p.top, p.ur, p.lr, p.bottom, p.ll, p.ul]); edges.closeSubpath()
    edges.move(to: p.ul); edges.addLine(to: c); edges.addLine(to: p.ur); edges.move(to: c); edges.addLine(to: p.bottom)
    stroke(edges, white, 50)
case "bars": // a bar chart on its baseline, the last bar lit
    let w = 96.0, gap = 44.0, x0 = 512 - (4 * w + 3 * gap) / 2, base = 318.0
    for (i, h) in [170.0, 286.0, 226.0, 404.0].enumerated() {
        fill(CGPath(roundedRect: CGRect(x: x0 + Double(i) * (w + gap), y: base + 34, width: w, height: h), cornerWidth: 30, cornerHeight: 30, transform: nil), i == 3 ? highlight : white)
    }
    let line = CGMutablePath(); line.move(to: CGPoint(x: x0 - 20, y: base)); line.addLine(to: CGPoint(x: 1024 - x0 + 20, y: base))
    stroke(line, white, 40)
case "film": // a frame with its sprocket holes, and a play mark in it
    let frame = CGRect(x: 218, y: 286, width: 588, height: 452)
    stroke(CGPath(roundedRect: frame, cornerWidth: 96, cornerHeight: 96, transform: nil), white, 46)
    for x in stride(from: 326.0, through: 698.0, by: 124.0) {
        for y in [frame.maxY - 70, frame.minY + 70] { fill(CGPath(roundedRect: CGRect(x: x - 26, y: y - 18, width: 52, height: 36), cornerWidth: 12, cornerHeight: 12, transform: nil), white.copy(alpha: 0.7)!) }
    }
    let play = CGMutablePath(); play.addLines(between: [CGPoint(x: 458, y: 420), CGPoint(x: 458, y: 604), CGPoint(x: 616, y: 512)]); play.closeSubpath()
    ctx.addPath(play); ctx.setFillColor(highlight); ctx.setStrokeColor(highlight); ctx.setLineWidth(34); ctx.setLineJoin(.round); ctx.drawPath(using: .fillStroke)
case "bone": // a bone across the middle, its long shadow falling straight down to the edge
    let c = CGPoint(x: 512, y: 512), r = 104.0, dx = 200.0, dy = 100.0
    // the shadow starts under the bone, at the lower knobs' centres, as wide as the bone
    fill(CGPath(rect: CGRect(x: c.x - dx - r, y: body.minY, width: 2 * (dx + r), height: c.y - dy - body.minY), transform: nil), highlight)
    let bone = CGMutablePath()
    bone.addRect(CGRect(x: c.x - dx, y: c.y - r, width: 2 * dx, height: 2 * r))
    for (x, y) in [(-dx, -dy), (-dx, dy), (dx, -dy), (dx, dy)] { bone.addEllipse(in: CGRect(x: c.x + x - r, y: c.y + y - r, width: 2 * r, height: 2 * r)) }
    fill(bone, white)
default:
    FileHandle.standardError.write("no glyph \(glyph): gauge, chat, cube, bars, film or bone\n".data(using: .utf8)!)
    exit(2)
}
ctx.restoreGState()
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print(out)
