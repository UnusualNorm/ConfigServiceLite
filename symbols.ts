const SYMBOL_SERVICE = Deno.env.get("SYMBOL_SERVICE")!;
// const SYMBOL_SERVICE = "http://localhost:8080";

export const generateSymbol = async (
  name: string,
): Promise<bigint> => {
  const url = new URL(`/${name}`, SYMBOL_SERVICE);
  const response = await fetch(url.toString());
  const responseBuffer = await response.arrayBuffer();
  const bigInt64Array = new BigInt64Array(responseBuffer);
  return bigInt64Array[0];
};

const symbolCache = new Map<string, bigint>();

export const getSymbol = async (
  name: string,
): Promise<bigint> => {
  if (symbolCache.has(name)) {
    return symbolCache.get(name)!;
  }

  const symbol = await generateSymbol(name);
  symbolCache.set(name, symbol);
  return symbol;
};

const convertToUint64 = (bigInt: bigint): bigint => {
  const uint64Array = new BigUint64Array([bigInt]);
  return uint64Array[0];
};

export const stringifySymbol = (symbol: bigint): string =>
  `0x${convertToUint64(symbol).toString(16).padStart(16, "0")}`;
