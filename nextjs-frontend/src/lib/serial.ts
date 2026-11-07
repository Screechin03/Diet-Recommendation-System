// USB connection to the ESP32 via the Web Serial API (Chrome/Edge on desktop; not Safari/Firefox/phones).
// Minimal typings: Web Serial isn't in TypeScript's DOM lib.

interface SerialPortInfo { usbVendorId?: number; usbProductId?: number }
interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}
interface SerialLike extends EventTarget {
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPortLike>;
}

export const BAUD_RATE = 115200;

// USB-to-serial chips found on ESP32 boards, to show a friendly name.
const CHIPS: Record<number, string> = {
  0x10c4: "Silicon Labs CP210x",
  0x1a86: "WCH CH340",
  0x303a: "Espressif USB",
  0x0403: "FTDI",
};

function serialApi(): SerialLike | null {
  if (typeof navigator === "undefined") return null;
  const s = (navigator as Navigator & { serial?: SerialLike }).serial;
  return s ?? null;
}

export function isWebSerialSupported(): boolean {
  return serialApi() !== null && typeof window !== "undefined" && window.isSecureContext;
}

export class SerialError extends Error {}

export interface SerialConnection {
  label: string;
  /** Resolves when reading stops (disconnect, unplug or error). */
  done: Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Asks the user to pick the device, opens it and calls `onLine` for every complete text line.
 * Must be called from a click handler (browser rule for the port picker).
 */
export async function connectSerial(onLine: (line: string) => void, onError: (message: string) => void): Promise<SerialConnection> {
  const api = serialApi();
  if (!api) throw new SerialError("This browser can't connect to USB devices. Use Chrome or Edge on a computer, or import the SD-card file.");

  let port: SerialPortLike;
  try {
    port = await api.requestPort();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") throw new SerialError("No device was selected.");
    throw new SerialError("Couldn't open the device picker.");
  }

  try {
    await port.open({ baudRate: BAUD_RATE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/already open/i.test(msg)) {
      // Opened earlier in this tab: reuse it.
    } else {
      throw new SerialError(
        "The device is busy. Close any other program using it (for example the Arduino IDE Serial Monitor) and try again.",
      );
    }
  }
  if (!port.readable) throw new SerialError("The device isn't sending data. Unplug it, plug it back in and try again.");

  const info = port.getInfo();
  const label = info.usbVendorId != null ? CHIPS[info.usbVendorId] ?? "USB serial device" : "USB serial device";

  const decoder = new TextDecoderStream();
  const piped = port.readable.pipeTo(decoder.writable as unknown as WritableStream<Uint8Array>).catch(() => undefined);
  const reader = decoder.readable.getReader();
  let stopped = false;

  const done = (async () => {
    let buffer = "";
    try {
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += value;
        // A JSON line can arrive split across reads: only emit complete lines.
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          if (line) onLine(line);
          nl = buffer.indexOf("\n");
        }
        if (buffer.length > 200_000) buffer = ""; // no newline for a long time: not our protocol, drop it
      }
    } catch {
      if (!stopped) onError("The device was disconnected.");
    } finally {
      reader.releaseLock();
    }
  })();

  return {
    label,
    done,
    async disconnect() {
      stopped = true;
      try {
        await reader.cancel();
      } catch {
        // already closed
      }
      await piped;
      await done;
      try {
        await port.close();
      } catch {
        // already closed (e.g. unplugged)
      }
    },
  };
}
