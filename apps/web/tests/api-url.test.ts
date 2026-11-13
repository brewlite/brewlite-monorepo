import { afterEach, describe, expect, it, vi } from "vitest";
import { apiUrl } from "../services/product.service";

afterEach(() => vi.unstubAllEnvs());

describe("apiUrl", () => {
  it("keeps query parameters as a URL query", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");

    expect(apiUrl("/admin/users/user-1/orders?page=1&pageSize=10&status=CANCELLED"))
      .toBe("http://localhost:3001/api/admin/users/user-1/orders?page=1&pageSize=10&status=CANCELLED");
  });

  it("builds query-free API paths without a trailing question mark", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001/api/");

    expect(apiUrl("/admin/users")).toBe("http://localhost:3001/api/admin/users");
  });
});
