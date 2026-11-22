import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CenteredDialog } from "../components/ui/centered-dialog";
Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
afterEach(cleanup);
it("dismisses only the top confirmation and stops Escape propagation", () => {
  const parentClose = vi.fn(); const globalEscape = vi.fn();
  function Stack() {
    const [confirm, setConfirm] = useState(true);
    return <div onKeyDown={globalEscape}><CenteredDialog label="Sửa tài khoản" onClose={parentClose}><input aria-label="Tên" defaultValue="Tên đang sửa" /></CenteredDialog>{confirm && <CenteredDialog label="Khóa tài khoản?" onClose={() => setConfirm(false)}><button>Hủy</button></CenteredDialog>}</div>;
  }
  render(<Stack />);
  const dialog = screen.getByRole("dialog", { name: "Khóa tài khoản?" });
  expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(false);
  expect(screen.queryByRole("dialog", { name: "Khóa tài khoản?" })).toBeNull();
  expect(globalEscape).not.toHaveBeenCalled();

  expect(screen.queryByRole("dialog", { name: "Khóa tài khoản?" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "Sửa tài khoản" })).toBeDefined();
  expect((screen.getByLabelText("Tên") as HTMLInputElement).value).toBe("Tên đang sửa");
  expect(parentClose).not.toHaveBeenCalled();
});
