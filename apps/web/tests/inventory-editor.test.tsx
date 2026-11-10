import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InventoryEditor } from "../components/product/inventory-editor";
import { InventoryTable } from "../components/admin/inventory-table";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../services/store.service", () => ({ sendStore: send }));
vi.mock("../services/auth.service", () => ({ authError: () => "Tồn kho đã thay đổi. Vui lòng tải lại." }));
Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const row = { id: "sku", name: "M", onHand: 5, reserved: 2, version: 4 };
function open() { fireEvent.click(screen.getByRole("button", { name: "Chỉnh tồn Latte, size M" })); }
it("focuses the editor, previews availability and cancels with Escape without writing", () => {
  const preview = vi.fn();
  render(<InventoryEditor row={row} productName="Latte" onSaved={vi.fn()} onPreview={preview} />);
  open(); const input = screen.getByLabelText("Tồn thực tế M");
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: "6" } });
  expect(preview).toHaveBeenLastCalledWith(6);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByLabelText("Tồn thực tế M")).toBeNull();
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(send).not.toHaveBeenCalled();
});
it("saves normal changes without confirmation and undoes using the returned CAS version", async () => {
  send.mockResolvedValueOnce({ ...row, onHand: 6, version: 5 }).mockResolvedValueOnce({ ...row, version: 6 });
  render(<InventoryEditor row={row} productName="Latte" onSaved={vi.fn()} />);
  open(); fireEvent.change(screen.getByLabelText("Tồn thực tế M"), { target: { value: "6" } });
  fireEvent.submit(screen.getByLabelText("Tồn thực tế M").closest("form")!);
  expect(screen.queryByRole("dialog")).toBeNull();
  await screen.findByRole("button", { name: "Hoàn tác" });
  expect(send).toHaveBeenNthCalledWith(1, "/admin/sizes/sku/inventory", { onHand: 6, expectedVersion: 4 }, "patch");
  fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
  await waitFor(() => expect(send).toHaveBeenNthCalledWith(2, "/admin/sizes/sku/inventory", { onHand: 5, expectedVersion: 5 }, "patch"));
});
it("validates empty, fractional, negative and below-reserved quantities immediately", () => {
  render(<InventoryEditor row={row} productName="Latte" onSaved={vi.fn()} />); open();
  const input = screen.getByLabelText("Tồn thực tế M");
  for (const value of ["", "1", "-1", "2.5"]) {
    fireEvent.change(input, { target: { value } });
    expect(screen.getByRole("button", { name: "Lưu tồn" }).hasAttribute("disabled")).toBe(true);
    if (value === "1") expect(screen.getByRole("alert").textContent).toContain("Không thấp hơn số đang giữ: 2");
  }
  expect(send).not.toHaveBeenCalled();
});
it("asks before turning an available size into out of stock", async () => {
  send.mockResolvedValue({ ...row, reserved: 0, onHand: 0, version: 5 });
  render(<InventoryEditor row={{ ...row, reserved: 0 }} productName="Latte" onSaved={vi.fn()} />); open();
  fireEvent.change(screen.getByLabelText("Tồn thực tế M"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu tồn" }));
  expect(screen.getByRole("dialog", { name: "Đặt tồn về 0?" })).toBeDefined();
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Đặt về 0" }));
  await screen.findByRole("button", { name: "Hoàn tác" });
});
it("requires refresh after version conflict and never retries automatically", async () => {
  send.mockRejectedValue(new Error("conflict")); const refresh = vi.fn();
  render(<InventoryEditor row={row} productName="Latte" onSaved={refresh} />); open();
  fireEvent.change(screen.getByLabelText("Tồn thực tế M"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu tồn" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Lưu tồn" }).hasAttribute("disabled")).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Tải lại tồn kho" }));
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("does not offer undo to null when initializing inventory", async () => {
  send.mockResolvedValue({ ...row, onHand: 8, version: 5 });
  render(<InventoryEditor row={{ ...row, onHand: null }} productName="Latte" onSaved={vi.fn()} />); open();
  fireEvent.change(screen.getByLabelText("Tồn thực tế M"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu tồn" }));
  await screen.findByRole("status");
  expect(screen.queryByRole("button", { name: "Hoàn tác" })).toBeNull();
});
it("previews available quantity in its table column and clears it on cancel", () => {
  render(<InventoryTable rows={[{ ...row, productId: "latte", extraPrice: "0" }]} products={[{ id: "latte", name: "Latte" }]} onEdit={vi.fn()} onSaved={vi.fn()} />);
  open();
  fireEvent.change(screen.getByLabelText("Tồn thực tế M"), { target: { value: "6" } });
  expect(screen.getByText("3 →")).toBeDefined();
  expect(screen.getByText("4")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Hủy sửa tồn" }));
  expect(screen.queryByText("3 →")).toBeNull();
});
it("never forces an undo after a concurrent inventory update", async () => {
  send.mockResolvedValueOnce({ ...row, onHand: 6, version: 5 }).mockRejectedValueOnce(new Error("conflict"));
  render(<InventoryEditor row={row} productName="Latte" onSaved={vi.fn()} />); open();
  fireEvent.change(screen.getByLabelText("Tồn thực tế M"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu tồn" }));
  fireEvent.click(await screen.findByRole("button", { name: "Hoàn tác" }));
  await screen.findByRole("alert");
  expect(send).toHaveBeenCalledTimes(2);
  expect(send).toHaveBeenLastCalledWith("/admin/sizes/sku/inventory", { onHand: 5, expectedVersion: 5 }, "patch");
  expect(screen.queryByRole("button", { name: "Hoàn tác" })).toBeNull();
});
