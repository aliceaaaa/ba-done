import ExpoModulesCore
import Foundation

enum SystemVoiceEntryStore {
  static let defaultsKey = "systemVoiceEntry.pendingPayloads.v1"
  static let notificationName = Notification.Name("SystemVoiceEntryPayloadQueued")

  static func count() -> Int {
    (UserDefaults.standard.array(forKey: defaultsKey) as? [[String: String]])?.count ?? 0
  }

  static func drain() -> [[String: String]] {
    let payloads = (UserDefaults.standard.array(forKey: defaultsKey) as? [[String: String]]) ?? []
    UserDefaults.standard.removeObject(forKey: defaultsKey)
    return payloads
  }
}

public class SystemVoiceEntryModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("SystemVoiceEntry")

    Events("onPayloadQueued")

    Function("pendingPayloadCount") { () -> Int in
      SystemVoiceEntryStore.count()
    }.runOnQueue(.main)

    Function("consumePendingPayloads") { () -> [[String: String]] in
      SystemVoiceEntryStore.drain()
    }.runOnQueue(.main)

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: SystemVoiceEntryStore.notificationName,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onPayloadQueued", [:])
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
      }
      self.observer = nil
    }
  }
}
