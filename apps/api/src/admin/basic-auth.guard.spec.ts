import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { AdminBasicAuthGuard } from "./basic-auth.guard";

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function makeContext(authorization?: string) {
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

describe("AdminBasicAuthGuard", () => {
  let getMock: jest.Mock;
  let guard: AdminBasicAuthGuard;

  beforeEach(() => {
    getMock = jest.fn();
    const config = { get: getMock } as any;
    guard = new AdminBasicAuthGuard(config);
  });

  it("fails closed when no admin credentials are configured at all", () => {
    getMock.mockReturnValue(undefined);
    const { context } = makeContext(basicAuthHeader("admin", "admin"));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects a request with no Authorization header", () => {
    getMock.mockImplementation((key: string) => (key === "ADMIN_USERNAME" ? "admin" : "secret"));
    const { context } = makeContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects malformed (non-Basic) Authorization headers", () => {
    getMock.mockImplementation((key: string) => (key === "ADMIN_USERNAME" ? "admin" : "secret"));
    const { context } = makeContext("Bearer sometoken");

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects the wrong password", () => {
    getMock.mockImplementation((key: string) => (key === "ADMIN_USERNAME" ? "admin" : "secret"));
    const { context } = makeContext(basicAuthHeader("admin", "wrong-password"));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("rejects the wrong username", () => {
    getMock.mockImplementation((key: string) => (key === "ADMIN_USERNAME" ? "admin" : "secret"));
    const { context } = makeContext(basicAuthHeader("not-admin", "secret"));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("accepts correct credentials", () => {
    getMock.mockImplementation((key: string) => (key === "ADMIN_USERNAME" ? "admin" : "secret"));
    const { context } = makeContext(basicAuthHeader("admin", "secret"));

    expect(guard.canActivate(context)).toBe(true);
  });

  it("sets WWW-Authenticate on rejection so browsers prompt correctly", () => {
    getMock.mockImplementation((key: string) => (key === "ADMIN_USERNAME" ? "admin" : "secret"));
    const { context, setHeader } = makeContext(undefined);

    expect(() => guard.canActivate(context)).toThrow();
    expect(setHeader).toHaveBeenCalledWith("WWW-Authenticate", expect.stringContaining("Basic"));
  });

  it("rejects credentials of mismatched length without throwing internally", () => {
    getMock.mockImplementation((key: string) => (key === "ADMIN_USERNAME" ? "admin" : "a-very-long-secret-password"));
    const { context } = makeContext(basicAuthHeader("admin", "short"));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
