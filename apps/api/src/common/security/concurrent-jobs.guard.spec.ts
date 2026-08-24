import { ExecutionContext } from "@nestjs/common";
import { ConcurrentJobsGuard } from "./concurrent-jobs.guard";
import { TooManyConcurrentJobsException } from "./too-many-concurrent-jobs.exception";

function makeContext(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe("ConcurrentJobsGuard", () => {
  let countMock: jest.Mock;
  let getMock: jest.Mock;
  let guard: ConcurrentJobsGuard;

  beforeEach(() => {
    countMock = jest.fn();
    getMock = jest.fn();
    const prisma = { downloadJob: { count: countMock } } as any;
    const config = { get: getMock } as any;
    guard = new ConcurrentJobsGuard(prisma, config);
  });

  it("allows the request when the IP is under the concurrent job limit", async () => {
    getMock.mockReturnValue(2); // MAX_CONCURRENT_JOBS_PER_IP
    countMock.mockResolvedValue(1);

    await expect(guard.canActivate(makeContext("1.2.3.4"))).resolves.toBe(true);
  });

  it("blocks the request when the IP is at the concurrent job limit", async () => {
    getMock.mockReturnValue(2);
    countMock.mockResolvedValue(2);

    await expect(guard.canActivate(makeContext("1.2.3.4"))).rejects.toThrow(TooManyConcurrentJobsException);
  });

  it("blocks the request when the IP is over the concurrent job limit", async () => {
    getMock.mockReturnValue(2);
    countMock.mockResolvedValue(5);

    await expect(guard.canActivate(makeContext("1.2.3.4"))).rejects.toThrow(TooManyConcurrentJobsException);
  });

  it("queries only active (queued/processing) jobs scoped to the requesting IP", async () => {
    getMock.mockReturnValue(2);
    countMock.mockResolvedValue(0);

    await guard.canActivate(makeContext("9.9.9.9"));

    expect(countMock).toHaveBeenCalledWith({
      where: { ipAddress: "9.9.9.9", status: { in: ["queued", "processing"] } },
    });
  });

  it("falls back to a default limit of 2 when MAX_CONCURRENT_JOBS_PER_IP is unset", async () => {
    getMock.mockReturnValue(undefined);
    countMock.mockResolvedValue(1);

    await expect(guard.canActivate(makeContext("1.2.3.4"))).resolves.toBe(true);

    countMock.mockResolvedValue(2);
    await expect(guard.canActivate(makeContext("1.2.3.4"))).rejects.toThrow(TooManyConcurrentJobsException);
  });

  it("treats a missing req.ip as its own bucket rather than crashing", async () => {
    getMock.mockReturnValue(2);
    countMock.mockResolvedValue(0);

    const context = {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(countMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ipAddress: "unknown" }) }));
  });
});
