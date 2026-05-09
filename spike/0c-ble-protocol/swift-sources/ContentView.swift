// ContentView.swift
// DiveForge spike — Phase C2 Layer 2 UI

import SwiftUI

struct ContentView: View {
    @StateObject private var client = PeregrineClient()

    var body: some View {
        VStack(spacing: 12) {
            Text("DiveForge BLE spike")
                .font(.headline)
            HStack {
                Circle().fill(client.connected ? .green : .gray).frame(width: 10, height: 10)
                Text(client.status).font(.subheadline)
            }
            HStack(spacing: 12) {
                Button("Scan") { client.startScan() }
                    .buttonStyle(.borderedProminent)
                Button("Disconnect") { client.stopScanAndDisconnect() }
                    .buttonStyle(.bordered)
                    .disabled(!client.connected)
            }
            Divider()
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(client.log) { entry in
                            HStack(alignment: .top, spacing: 6) {
                                Text(symbol(for: entry.direction))
                                    .frame(width: 18)
                                Text(entry.text)
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(color(for: entry.direction))
                                    .textSelection(.enabled)
                            }
                            .id(entry.id)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .onChange(of: client.log.count) { _, _ in
                    if let last = client.log.last { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
            .background(Color(uiColor: .secondarySystemBackground))
            .cornerRadius(6)

            HStack {
                Text("RX buffer: \(client.rxBuffer.count) bytes")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .padding()
    }

    private func symbol(for d: PeregrineClient.LogEntry.Direction) -> String {
        switch d {
        case .info: return "·"
        case .rx:   return "←"
        case .tx:   return "→"
        case .err:  return "✗"
        }
    }
    private func color(for d: PeregrineClient.LogEntry.Direction) -> Color {
        switch d {
        case .info: return .secondary
        case .rx:   return .blue
        case .tx:   return .purple
        case .err:  return .red
        }
    }
}

#Preview {
    ContentView()
}
