// The chip's hottest die sensor, in °C, read through IOHIDEventSystemClient: no sudo, no SMC.
// render.mjs compiles it once (swiftc -O) into ~/Library/Caches/film-render/ and polls it to hold
// the workers while the chip is hot. Prints "max <°C> mean <°C> n <sensors>"; --all lists them.
import Foundation
import IOKit.hid

@_silgen_name("IOHIDEventSystemClientCreate") func IOHIDEventSystemClientCreate(_ allocator: CFAllocator?) -> Unmanaged<AnyObject>?
@_silgen_name("IOHIDEventSystemClientSetMatching") func IOHIDEventSystemClientSetMatching(_ client: AnyObject, _ matching: CFDictionary) -> Int32
@_silgen_name("IOHIDEventSystemClientCopyServices") func IOHIDEventSystemClientCopyServices(_ client: AnyObject) -> Unmanaged<CFArray>?
@_silgen_name("IOHIDServiceClientCopyProperty") func IOHIDServiceClientCopyProperty(_ service: AnyObject, _ key: CFString) -> Unmanaged<AnyObject>?
@_silgen_name("IOHIDServiceClientCopyEvent") func IOHIDServiceClientCopyEvent(_ service: AnyObject, _ type: Int64, _ options: Int32, _ timestamp: Int64) -> Unmanaged<AnyObject>?
@_silgen_name("IOHIDEventGetFloatValue") func IOHIDEventGetFloatValue(_ event: AnyObject, _ field: Int32) -> Double

let kTemperature: Int64 = 15 // kIOHIDEventTypeTemperature; its level field is type << 16
guard let client = IOHIDEventSystemClientCreate(kCFAllocatorDefault)?.takeRetainedValue() else { exit(1) }
_ = IOHIDEventSystemClientSetMatching(client, ["PrimaryUsagePage": 0xff00, "PrimaryUsage": 5] as CFDictionary)
guard let services = IOHIDEventSystemClientCopyServices(client)?.takeRetainedValue() as? [AnyObject] else { exit(2) }
var rows: [(String, Double)] = []
for s in services {
  let name = (IOHIDServiceClientCopyProperty(s, "Product" as CFString)?.takeRetainedValue() as? String) ?? "?"
  guard let ev = IOHIDServiceClientCopyEvent(s, kTemperature, 0, 0)?.takeRetainedValue() else { continue }
  let v = IOHIDEventGetFloatValue(ev, Int32(kTemperature << 16))
  if v > -40 && v < 150 { rows.append((name, v)) }
}
if CommandLine.arguments.contains("--all") { for (n, v) in rows.sorted(by: { $0.0 < $1.0 }) { print(String(format: "%-28@ %6.1f", n as NSString, v)) } }
// the die sensors when the chip has them (Apple silicon: "PMU tdie…"), every sensor otherwise
let die = rows.filter { $0.0.lowercased().contains("tdie") || $0.0.lowercased().contains("tdev") }
let pick = die.isEmpty ? rows : die
guard let mx = pick.map({ $0.1 }).max() else { exit(3) }
print(String(format: "max %.1f mean %.1f n %d", mx, pick.map { $0.1 }.reduce(0, +) / Double(pick.count), pick.count))
