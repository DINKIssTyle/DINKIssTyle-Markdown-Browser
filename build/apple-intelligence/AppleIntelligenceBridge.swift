/*
 * Native bridge between Go and Apple's on-device Foundation Models framework.
 * The exported C functions intentionally use only C-compatible values so the
 * same bridge can be loaded from a macOS app bundle or linked into the iOS app.
 */

import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

private let statusAvailable: Int32 = 0
private let statusDeviceNotEligible: Int32 = 1
private let statusAppleIntelligenceNotEnabled: Int32 = 2
private let statusModelNotReady: Int32 = 3
private let statusOSNotSupported: Int32 = 4
private let statusLocaleNotSupported: Int32 = 5
private let statusUnknown: Int32 = 6

private final class BridgeResult: @unchecked Sendable {
    private let lock = NSLock()
    private var value: String?
    private var failure: String?

    func store(value: String) {
        lock.lock()
        self.value = value
        lock.unlock()
    }

    func store(error: Error) {
        lock.lock()
        failure = error.localizedDescription
        lock.unlock()
    }

    func read() -> (String?, String?) {
        lock.lock()
        defer { lock.unlock() }
        return (value, failure)
    }
}

@_cdecl("DKSTAppleIntelligenceStatus")
public func appleIntelligenceStatus() -> Int32 {
#if canImport(FoundationModels)
    if #available(macOS 26.0, iOS 26.0, *) {
        let model = SystemLanguageModel.default
        switch model.availability {
        case .available:
            return model.supportsLocale(Locale.current) ? statusAvailable : statusLocaleNotSupported
        case .unavailable(.deviceNotEligible):
            return statusDeviceNotEligible
        case .unavailable(.appleIntelligenceNotEnabled):
            return statusAppleIntelligenceNotEnabled
        case .unavailable(.modelNotReady):
            return statusModelNotReady
        @unknown default:
            return statusUnknown
        }
    }
#endif
    return statusOSNotSupported
}

@_cdecl("DKSTAppleIntelligenceGenerate")
public func appleIntelligenceGenerate(
    _ instructionsPointer: UnsafePointer<CChar>?,
    _ promptPointer: UnsafePointer<CChar>?,
    _ temperature: Double,
    _ errorPointer: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> UnsafeMutablePointer<CChar>? {
    guard appleIntelligenceStatus() == statusAvailable else {
        errorPointer?.pointee = strdup("Apple Intelligence is not available on this device.")
        return nil
    }
    guard let instructionsPointer, let promptPointer else {
        errorPointer?.pointee = strdup("Apple Intelligence received an invalid prompt.")
        return nil
    }

#if canImport(FoundationModels)
    if #available(macOS 26.0, iOS 26.0, *) {
        let instructions = String(cString: instructionsPointer)
        let prompt = String(cString: promptPointer)
        let result = BridgeResult()
        let completed = DispatchSemaphore(value: 0)

        Task.detached {
            do {
                let session = LanguageModelSession(model: SystemLanguageModel.default, instructions: instructions)
                let options = GenerationOptions(temperature: temperature > 0 ? temperature : nil)
                let response = try await session.respond(to: prompt, options: options)
                result.store(value: response.content)
            } catch {
                result.store(error: error)
            }
            completed.signal()
        }

        completed.wait()
        let (value, failure) = result.read()
        if let value {
            return strdup(value)
        }
        errorPointer?.pointee = strdup(failure ?? "Apple Intelligence could not generate a response.")
        return nil
    }
#endif

    errorPointer?.pointee = strdup("Apple Intelligence requires macOS 26 or iOS/iPadOS 26 or later.")
    return nil
}
