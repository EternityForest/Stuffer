// globals.d.ts
declare module globalThis {
    var nfcreader: NDEFReader | null;
    var nfcabort: AbortController | null;
}