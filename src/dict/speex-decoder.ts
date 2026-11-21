// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry
/**
 * lilium 辭典 — Speex (.spx) 解碼（Ogg Speex → WAV）。
 *
 * .spx 實務上是 Ogg 容器封裝的 Speex 位流。瀏覽器/Electron 原生不解碼 Speex，
 * 這裡用內置的 libspeex WASM（vendor/speex/speex-wasm.wasm，161KB）＋自寫
 * Ogg demuxer 完成解碼，回傳可餵給 <audio> 的 WAV ArrayBuffer。
 */

import { loadSpeexModule } from '../speex-loader';

const OGGS = 0x5367674f; // 'OggS' little-endian

interface SpeexHeader {
	rate: number;
	nbChannels: number;
	frameSize: number;
	mode: number;
}

interface OggPage {
	/** packed frames (one per lacing unit) */
	frames: Uint8Array[];
	granule: bigint;
}

function oggDemux(buf: Uint8Array): OggPage[] {
	const pages: OggPage[] = [];
	const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	let p = 0;
	while (p + 27 <= buf.length) {
		if (dv.getUint32(p, true) !== OGGS) break;
		const nseg = buf[p + 26];
		const headerLen = 27 + nseg;
		if (p + headerLen > buf.length) break;
		let bodyLen = 0;
		for (let i = 0; i < nseg; i++) bodyLen += buf[p + 27 + i];
		if (p + headerLen + bodyLen > buf.length) break;
		let body = buf.subarray(p + headerLen, p + headerLen + bodyLen);
		const granule = dv.getBigInt64(p + 6, true);
		// split body into frames by lacing values
		const frames: Uint8Array[] = [];
		let cur: Uint8Array[] = [];
		for (let i = 0; i < nseg; i++) {
			const l = buf[p + 27 + i];
			cur.push(body.subarray(0, l));
			body = body.subarray(l);
			if (l < 255) {
				frames.push(concatParts(cur));
				cur = [];
			}
		}
		if (cur.length) frames.push(concatParts(cur));
		pages.push({ frames, granule });
		p += headerLen + bodyLen;
	}
	return pages;
}

function concatParts(parts: Uint8Array[]): Uint8Array {
	let total = 0;
	for (const x of parts) total += x.length;
	const out = new Uint8Array(total);
	let o = 0;
	for (const x of parts) {
		out.set(x, o);
		o += x.length;
	}
	return out;
}

function parseSpeexHeader(frame: Uint8Array): SpeexHeader | null {
	if (frame.length < 80) return null;
	const magic = String.fromCharCode(...frame.subarray(0, 6));
	if (magic !== 'Speex ') return null;
	const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
	return {
		rate: dv.getInt32(36, true),
		nbChannels: dv.getInt32(48, true) || 1,
		frameSize: dv.getInt32(56, true),
		mode: dv.getInt32(40, true),
	};
}

const MAX_FRAME_BYTES = 512;

export interface SpeexDecodeResult {
	wav: ArrayBuffer;
	sampleRate: number;
	channels: number;
}

/**
 * Decode an Ogg Speex (.spx) byte stream to a 16-bit PCM WAV ArrayBuffer.
 * Throws on malformed input; callers should fall back to a Notice.
 */
export async function decodeSpeexToWav(data: Uint8Array): Promise<SpeexDecodeResult> {
	const mod = await loadSpeexModule();

	const pages = oggDemux(data);
	if (pages.length < 2) throw new Error('spx: no ogg pages');
	const header = parseSpeexHeader(pages[0].frames[0]);
	if (!header || !header.frameSize) throw new Error('spx: bad speex header');

	const handle = mod._speex_js_decoder_create(header.rate);
	if (!handle) throw new Error('spx: decoder init failed');
	const frameSize = mod._speex_js_decoder_frame_size(handle);
	const framePtr = mod._malloc(MAX_FRAME_BYTES);
	const pcmPtr = mod._malloc(frameSize * 2 * 2);

	const chunks: Int16Array[] = [];
	try {
		for (let i = 1; i < pages.length; i++) {
			for (const frame of pages[i].frames) {
				if (!frame.length || frame.length > MAX_FRAME_BYTES) continue;
				new Uint8Array(mod.memory.buffer).set(frame, framePtr);
				const n = mod._speex_js_decode(handle, framePtr, frame.length, pcmPtr);
				if (n > 0) {
					chunks.push(new Int16Array(mod.memory.buffer).slice(pcmPtr >> 1, (pcmPtr >> 1) + n));
				}
			}
		}
	} finally {
		mod._free(framePtr);
		mod._free(pcmPtr);
		mod._speex_js_decoder_destroy(handle);
	}
	if (!chunks.length) throw new Error('spx: no samples decoded');

	const channels = header.nbChannels;
	const wav = encodeWav(chunks, header.rate, channels);
	return { wav, sampleRate: header.rate, channels };
}

function encodeWav(chunks: Int16Array[], rate: number, channels: number): ArrayBuffer {
	const n = chunks.reduce((s, c) => s + c.length, 0);
	const buf = new ArrayBuffer(44 + n * 2);
	const dv = new DataView(buf);
	const ws = (o: number, s: string): void => {
		for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
	};
	ws(0, 'RIFF');
	dv.setUint32(4, 36 + n * 2, true);
	ws(8, 'WAVEfmt ');
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true);
	dv.setUint16(22, channels, true);
	dv.setUint32(24, rate, true);
	dv.setUint32(28, rate * channels * 2, true);
	dv.setUint16(32, channels * 2, true);
	dv.setUint16(34, 16, true);
	ws(36, 'data');
	dv.setUint32(40, n * 2, true);
	let o = 44;
	for (const c of chunks) {
		for (let i = 0; i < c.length; i++) {
			dv.setInt16(o, c[i], true);
			o += 2;
		}
	}
	return buf;
}

/** classify helper: .spx is Speex audio (Ogg container) */
export function isSpeexName(name: string): boolean {
	return /\.spx$/i.test(name);
}
