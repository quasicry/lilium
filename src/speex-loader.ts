// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 quasicry

/**
 * libspeex WASM 最小加載器（取代 vendor/speex/speex-wasm.js 的 Emscripten glue）。
 *
 * 原 glue 為 Emscripten 通用 runtime（環境探測/fetch/console/exit 等 ~9KB 單行產物），
 * 本插件場景只用 wasm 導出函數＋線性內存視圖；此檔以 ~60 行直連 WebAssembly.instantiate
 * 等價替代，審核 lint 全綠。wasm 導出映射（與原 glue assignWasmExports 一致）：
 *   e=memory, g=_free, l=_speex_js_decoder_create, m=_speex_js_decoder_frame_size,
 *   n=_speex_js_decode, o=_speex_js_decoder_destroy, p=_malloc
 * env imports（a 模組）：a=_fd_write, b=_emscripten_resize_heap, c=_fd_close, d=_exit
 */
import { SPEEX_WASM_BASE64 } from './speex-wasm-embed';

export interface SpeexModule {
	readonly memory: WebAssembly.Memory;
	_malloc(size: number): number;
	_free(ptr: number): void;
	_speex_js_decoder_create(rate: number): number;
	_speex_js_decoder_frame_size(handle: number): number;
	_speex_js_decode(handle: number, framePtr: number, frameLen: number, pcmPtr: number): number;
	_speex_js_decoder_destroy(handle: number): void;
}

/** stderr/stdout 靜默（libspeex 正常路徑無輸出；有輸出視為異常但不致命） */
function fdWrite(_fd: number, _iov: number, _iovcnt: number, pnum: number, heapU32: Uint32Array): number {
	heapU32[pnum >> 2] = 0;
	return 0;
}

function resizeHeap(memory: WebAssembly.Memory, requestedSize: number): boolean {
	const need = Math.max(requestedSize >>> 0, memory.buffer.byteLength) - memory.buffer.byteLength;
	const pages = Math.ceil(need / 65536);
	if (pages <= 0) return true;
	try {
		memory.grow(pages);
		return true;
	} catch {
		return false;
	}
}

let cached: Promise<SpeexModule> | null = null;

export function loadSpeexModule(): Promise<SpeexModule> {
	cached ??= (async (): Promise<SpeexModule> => {
		const bin = Uint8Array.from(atob(SPEEX_WASM_BASE64), (c) => c.charCodeAt(0));
		let memoryRef: WebAssembly.Memory | null = null;
		const mem = (): WebAssembly.Memory => memoryRef as WebAssembly.Memory;
		const imports = {
			a: {
				a: (fd: number, iov: number, iovcnt: number, pnum: number): number => fdWrite(fd, iov, iovcnt, pnum, new Uint32Array(mem().buffer)),
				b: (requestedSize: number): boolean => resizeHeap(mem(), requestedSize),
				c: (): number => 52,
				d: (code: number): void => {
					throw new Error(`speex wasm exited with code ${code}`);
				},
			},
		};
		const { instance } = await WebAssembly.instantiate(bin, imports);
		const ex = instance.exports as unknown as Record<string, unknown> & { e: WebAssembly.Memory };
		memoryRef = ex.e;
		return {
			memory: mem(),
			_malloc: ex.p as (n: number) => number,
			_free: ex.g as (p: number) => void,
			_speex_js_decoder_create: ex.l as (rate: number) => number,
			_speex_js_decoder_frame_size: ex.m as (h: number) => number,
			_speex_js_decode: ex.n as (h: number, fp: number, fl: number, pp: number) => number,
			_speex_js_decoder_destroy: ex.o as (h: number) => void,
		};
	})();
	return cached;
}
