import { describe, expect, it } from "vitest";
import { encodeErrorResult } from "viem";
import {
  REVERT_ERROR_ABI,
  classifyDecodedError,
  decodeRevertData,
} from "../src/simulateSwap.js";

describe("decodeRevertData", () => {
  it("decodes V4TooLittleReceived as not correctable", () => {
    const data = encodeErrorResult({
      abi: REVERT_ERROR_ABI,
      errorName: "V4TooLittleReceived",
      args: [99n, 72n],
    });
    const decoded = decodeRevertData(data);
    expect(decoded.name).toBe("V4TooLittleReceived");
    expect(decoded.shortMessage).toBe("V4TooLittleReceived(99, 72)");
    expect(decoded.correctable).toBe(false);
    expect(decoded.minOut).toBe(99n);
    expect(decoded.actualOut).toBe(72n);
  });

  it("decodes nested ExecutionFailed AllowanceExpired as correctable", () => {
    const inner = encodeErrorResult({
      abi: REVERT_ERROR_ABI,
      errorName: "AllowanceExpired",
      args: [0n],
    });
    const data = encodeErrorResult({
      abi: REVERT_ERROR_ABI,
      errorName: "ExecutionFailed",
      args: [0n, inner],
    });
    const decoded = decodeRevertData(data);
    expect(decoded.name).toBe("AllowanceExpired");
    expect(decoded.correctable).toBe(true);
    expect(classifyDecodedError("AllowanceExpired")).toBe(true);
    expect(classifyDecodedError("V4TooLittleReceived")).toBe(false);
  });
});
