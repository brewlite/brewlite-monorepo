import { afterEach, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from "axios";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

function failure(config: InternalAxiosRequestConfig, status: number) {
  const response = {
    data: { message: status === 401 ? "Unauthorized" : "Too many requests" },
    status,
    statusText: status === 401 ? "Unauthorized" : "Too Many Requests",
    headers: {},
    config,
  } as AxiosResponse;
  return new AxiosError(response.statusText, `ERR_${status}`, config, undefined, response);
}

it("refreshes once for concurrent 401s and stops when refresh fails", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");
  const { authHttp, onSessionExpired } = await import("../services/auth.service");
  const expired = vi.fn();
  const removeListener = onSessionExpired(expired);
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    if (config.url?.includes("/auth/refresh")) throw failure(config, 401);
    throw failure(config, 401);
  });
  authHttp.defaults.adapter = adapter;

  await expect(Promise.allSettled([
    authHttp.get("http://localhost:3001/api/admin/dashboard"),
    authHttp.get("http://localhost:3001/api/admin/products"),
  ])).resolves.toHaveLength(2);

  expect(adapter).toHaveBeenCalledTimes(3);
  expect(adapter.mock.calls.filter(([config]) => config.url?.includes("/auth/refresh"))).toHaveLength(1);
  expect(expired).toHaveBeenCalledTimes(1);
  removeListener();
});

it("does not retry a 429 response", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");
  const { authHttp } = await import("../services/auth.service");
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    throw failure(config, 429);
  });
  authHttp.defaults.adapter = adapter;

  await expect(authHttp.get("http://localhost:3001/api/auth/me")).rejects.toMatchObject({
    response: { status: 429 },
  });
  expect(adapter).toHaveBeenCalledTimes(1);
});
