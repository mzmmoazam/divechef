// ContentView.swift
// DiveForge spike — Phase C2 Layer 2 + Layer 3 UI

import SwiftUI

struct ContentView: View {
    @StateObject private var client = PeregrineClient()
    @State private var selectedDiveIndex: Int? = nil
    @State private var working: Bool = false
    @State private var lastError: String? = nil

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
                    .disabled(client.connected || working)
                Button("Disconnect") { client.stopScanAndDisconnect() }
                    .buttonStyle(.bordered)
                    .disabled(!client.connected || working)
            }
            Divider()

            // Layer 3 controls
            VStack(spacing: 8) {
                HStack {
                    Button("List dives") {
                        Task { await runListDives() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!client.connected || working)

                    Button("Download selected") {
                        Task { await runDownloadSelected() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(!client.connected || working || selectedDiveIndex == nil)
                }

                if !client.dives.isEmpty {
                    Picker("Dive", selection: $selectedDiveIndex) {
                        Text("Pick a dive").tag(Int?.none)
                        ForEach(client.dives) { d in
                            Text(String(format: "Dive %d  addr=0x%08x  fp=%@",
                                        d.index, d.address, d.fingerprintHex))
                                .tag(Int?.some(d.index))
                        }
                    }
                    .pickerStyle(.menu)
                }

                if !client.downloadProgress.isEmpty {
                    Text(client.downloadProgress)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let err = lastError {
                    Text("Error: \(err)")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
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

    @MainActor
    private func runListDives() async {
        working = true
        lastError = nil
        defer { working = false }
        do {
            _ = try await client.listDives()
        } catch {
            lastError = "\(error)"
        }
    }

    @MainActor
    private func runDownloadSelected() async {
        guard let idx = selectedDiveIndex else { return }
        working = true
        lastError = nil
        defer { working = false }
        do {
            _ = try await client.downloadDive(at: idx)
        } catch {
            lastError = "\(error)"
        }
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
