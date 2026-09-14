import AppIntents
import Foundation

enum SystemVoiceEntryQueue {
  static let defaultsKey = "systemVoiceEntry.pendingPayloads.v1"
  static let notificationName = Notification.Name("SystemVoiceEntryPayloadQueued")
  static let payloadVersion = "1"
  static let source = "iosAppIntent"
  static let maxQueuedPayloads = 10

  @MainActor
  static func enqueue(action: String, fields: [String: String?]) {
    var payload: [String: String] = [
      "version": payloadVersion,
      "intentId": UUID().uuidString,
      "action": action,
      "source": source,
      "locale": Locale.current.identifier(.bcp47),
      "createdAt": ISO8601DateFormatter().string(from: Date()),
    ]
    for (key, value) in fields {
      if let value, !value.isEmpty {
        payload[key] = value
      }
    }
    var queue = (UserDefaults.standard.array(forKey: defaultsKey) as? [[String: String]]) ?? []
    queue.append(payload)
    UserDefaults.standard.set(Array(queue.suffix(maxQueuedPayloads)), forKey: defaultsKey)
    NotificationCenter.default.post(name: notificationName, object: nil)
  }

  static func text(_ value: String?) -> String? {
    value?.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  static func integer(_ value: Int?) -> String? {
    value.map { String($0) }
  }

  static func localDate(_ value: Date?) -> String? {
    format(value, pattern: "yyyy-MM-dd")
  }

  static func localTime(_ value: Date?) -> String? {
    format(value, pattern: "HH:mm")
  }

  private static func format(_ value: Date?, pattern: String) -> String? {
    guard let value else {
      return nil
    }
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone.current
    formatter.dateFormat = pattern
    return formatter.string(from: value)
  }
}

@available(iOS 16.0, *)
struct AddToListIntent: AppIntent {
  static let title: LocalizedStringResource = "Add to List"
  static let description = IntentDescription("Opens the app to add an item to a list.")
  static let openAppWhenRun = true
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

  @Parameter(title: "Item", requestValueDialog: IntentDialog("What should I add?"))
  var item: String

  @Parameter(title: "List")
  var listName: String?

  @MainActor
  func perform() async throws -> some IntentResult {
    SystemVoiceEntryQueue.enqueue(
      action: "addListItem",
      fields: [
        "text": SystemVoiceEntryQueue.text(item),
        "listName": SystemVoiceEntryQueue.text(listName),
      ]
    )
    return .result()
  }
}

@available(iOS 16.0, *)
struct CaptureTaskIntent: AppIntent {
  static let title: LocalizedStringResource = "Capture Task"
  static let description = IntentDescription("Opens the app to capture a task.")
  static let openAppWhenRun = true
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

  @Parameter(title: "Task", requestValueDialog: IntentDialog("What is the task?"))
  var taskTitle: String

  @Parameter(title: "Date", kind: .date)
  var date: Date?

  @Parameter(title: "Priority", inclusiveRange: (1, 10))
  var priority: Int?

  @MainActor
  func perform() async throws -> some IntentResult {
    SystemVoiceEntryQueue.enqueue(
      action: "captureFutureTask",
      fields: [
        "text": SystemVoiceEntryQueue.text(taskTitle),
        "date": SystemVoiceEntryQueue.localDate(date),
        "priority": SystemVoiceEntryQueue.integer(priority),
      ]
    )
    return .result()
  }
}

@available(iOS 16.0, *)
struct CreateEventIntent: AppIntent {
  static let title: LocalizedStringResource = "Create Event"
  static let description = IntentDescription("Opens the app to create a calendar event.")
  static let openAppWhenRun = true
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

  @Parameter(title: "Title", requestValueDialog: IntentDialog("What is the event?"))
  var eventTitle: String

  @Parameter(title: "Date", kind: .date, requestValueDialog: IntentDialog("On which day?"))
  var date: Date

  @Parameter(title: "Start", kind: .time, requestValueDialog: IntentDialog("When does it start?"))
  var start: Date

  @Parameter(title: "Duration in minutes", inclusiveRange: (1, 1440))
  var durationMinutes: Int?

  @MainActor
  func perform() async throws -> some IntentResult {
    SystemVoiceEntryQueue.enqueue(
      action: "createCalendarEvent",
      fields: [
        "text": SystemVoiceEntryQueue.text(eventTitle),
        "date": SystemVoiceEntryQueue.localDate(date),
        "time": SystemVoiceEntryQueue.localTime(start),
        "durationMinutes": SystemVoiceEntryQueue.integer(durationMinutes),
      ]
    )
    return .result()
  }
}

@available(iOS 16.0, *)
struct OpenTodayIntent: AppIntent {
  static let title: LocalizedStringResource = "Open Today"
  static let description = IntentDescription("Opens today's tasks.")
  static let openAppWhenRun = true
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

  @MainActor
  func perform() async throws -> some IntentResult {
    SystemVoiceEntryQueue.enqueue(action: "openToday", fields: [:])
    return .result()
  }
}

@available(iOS 16.0, *)
struct StartVoiceCaptureIntent: AppIntent {
  static let title: LocalizedStringResource = "Start Voice Capture"
  static let description = IntentDescription("Opens the app and starts voice input.")
  static let openAppWhenRun = true
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

  @MainActor
  func perform() async throws -> some IntentResult {
    SystemVoiceEntryQueue.enqueue(action: "openVoiceCapture", fields: [:])
    return .result()
  }
}

@available(iOS 16.0, *)
struct SystemVoiceEntryShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: AddToListIntent(), phrases: ["Add an item to \(.applicationName)"])
    AppShortcut(intent: CaptureTaskIntent(), phrases: ["Capture a task in \(.applicationName)"])
    AppShortcut(intent: CreateEventIntent(), phrases: ["Create an event in \(.applicationName)"])
    AppShortcut(intent: OpenTodayIntent(), phrases: ["Show today in \(.applicationName)"])
    AppShortcut(
      intent: StartVoiceCaptureIntent(),
      phrases: ["Start voice capture in \(.applicationName)"]
    )
  }
}
