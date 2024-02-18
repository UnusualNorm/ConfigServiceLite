import { Config } from "./configs.ts";
import { getConfig } from "./configs.ts";
import { getSymbol, stringifySymbol } from "./symbols.ts";

import {
  compress,
  init,
} from "https://deno.land/x/zstd_wasm@0.0.21/deno/zstd.ts";

await init();

const HEADER = 0xbb8ce7a278bb40f6n;

Deno.serve({
  port: 31112,
}, (req) => {
  if (req.method !== "GET") {
    return new Response(null, {
      status: 405,
    });
  }

  if (req.headers.get("upgrade") !== "websocket") {
    return new Response(null, {
      status: 400,
    });
  }

  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") || "generic";
  const { socket, response } = Deno.upgradeWebSocket(req);

  const send = (symbol: bigint, data: Uint8Array): void => {
    console.log(
      `Sending ${stringifySymbol(symbol)} (${
        Array.from(data).map((byte) => byte.toString(16).padStart(2, "0")).join(
          "",
        )
      })`,
    );
    const length = BigInt(data.byteLength);
    const buffer = new Uint8Array(24 + data.byteLength);
    const dataView = new DataView(buffer.buffer);
    dataView.setBigUint64(0, HEADER, true);
    dataView.setBigInt64(8, symbol, true);
    dataView.setBigUint64(16, length, true);
    buffer.set(data, 24);
    socket.send(buffer);
  };

  const sendSuccess = async (
    typeSymbol: bigint,
    idSymbol: bigint,
    config: Config,
  ): Promise<void> => {
    const configData = new TextEncoder().encode(JSON.stringify(config));
    const uncompressed = new Uint8Array(configData.byteLength + 1);
    uncompressed.set(configData, 0);

    const compressed = compress(uncompressed);
    const data = new Uint8Array(20 + compressed.byteLength);
    const dataView = new DataView(data.buffer);

    dataView.setBigInt64(0, typeSymbol, true);
    dataView.setBigInt64(8, idSymbol, true);
    dataView.setUint32(16, configData.byteLength, true);
    data.set(compressed, 20);

    send(await getSymbol("SNSConfigSuccessv2"), data);
    send(await getSymbol("STcpConnectionUnrequireEvent"), new Uint8Array([0]));
  };

  const sendFailure = async (
    typeSymbol: bigint,
    idSymbol: bigint,
    errorInfo: {
      type: string;
      id: string;
      errorcode: number;
      error: string;
    },
  ): Promise<void> => {
    const errorInfoData = new TextEncoder().encode(JSON.stringify(errorInfo));
    const data = new Uint8Array(16 + errorInfoData.byteLength + 1);
    const dataView = new DataView(data.buffer);
    dataView.setBigInt64(0, typeSymbol, true);
    dataView.setBigInt64(8, idSymbol, true);
    data.set(errorInfoData, 16);
    send(await getSymbol("SNSConfigFailurev2"), data);
    send(await getSymbol("STcpConnectionUnrequireEvent"), new Uint8Array([0]));
  };

  const recieve = async (symbol: bigint, data: Uint8Array) => {
    console.log(
      `Recieved ${stringifySymbol(symbol)} (${
        Array.from(data).map((byte) => byte.toString(16).padStart(2, "0")).join(
          "",
        )
      })`,
    );

    if (symbol != await getSymbol("SNSConfigRequestv2")) return;
    const _typeTail = data[0];
    const infoData = data.slice(1, data.length - 1);
    const infoString = new TextDecoder().decode(infoData);
    const info: unknown = JSON.parse(infoString);
    if (typeof info !== "object" || info === null) return;
    if (!("type" in info) || typeof info.type !== "string") return;
    if (!("id" in info) || typeof info.id !== "string") return;

    const type = info.type;
    const id = info.id;
    const typeSymbol = await getSymbol(type);
    const idSymbol = await getSymbol(id);

    const config = getConfig(platform, type, id);
    if (config) await sendSuccess(typeSymbol, idSymbol, config);
    else {await sendFailure(typeSymbol, idSymbol, {
        type,
        id,
        errorcode: 1,
        error:
          `Could not find specified config data with the provided identifier (type = ${type}, id = ${id})`,
      });}
  };

  socket.onmessage = async (event) => {
    if (!(event.data instanceof ArrayBuffer)) return;
    const dataView = new DataView(event.data);
    let offset = 0;
    while (offset < event.data.byteLength) {
      const header = dataView.getBigUint64(offset, true);
      if (header !== HEADER) return;
      offset += 8;
      const symbol = dataView.getBigInt64(offset, true);
      offset += 8;
      const length = Number(dataView.getBigUint64(offset, true));
      offset += 8;
      await recieve(symbol, new Uint8Array(event.data, offset, length));
      offset += length;
    }
  };

  return response;
});
