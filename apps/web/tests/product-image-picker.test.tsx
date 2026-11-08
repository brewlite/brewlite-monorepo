import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductImagePicker } from "../components/admin/product-image-picker";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Picker() {
  const [file, setFile] = useState<File | null>(null);
  return <ProductImagePicker current="/images/products/coffee.jpg" file={file} disabled={false} onChange={setFile} />;
}
it("shows the existing image and previews a replacement without overwriting the old URL", () => {
  URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn();
  render(<Picker />);
  expect(screen.getByRole('button', { name: 'Đổi ảnh' })).toBeDefined();
  expect(screen.getByRole('img').getAttribute('src')).toBe('/images/products/coffee.jpg');
  fireEvent.change(screen.getByLabelText('Chọn ảnh sản phẩm'), { target: { files: [new File(['image'], 'new.png', { type: 'image/png' })] } });
  expect(screen.getByRole('img').getAttribute('src')).toBe('blob:preview');
  fireEvent.click(screen.getByRole('button', { name: 'Hủy đổi ảnh' }));
  expect(screen.getByRole('img').getAttribute('src')).toBe('/images/products/coffee.jpg');
});
it("rejects unsupported file types", () => {
  render(<Picker />);
  fireEvent.change(screen.getByLabelText('Chọn ảnh sản phẩm'), { target: { files: [new File(['svg'], 'bad.svg', { type: 'image/svg+xml' })] } });
  expect(screen.getByRole('alert').textContent).toContain('tối đa 5 MB');
  expect(screen.getByRole('img').getAttribute('src')).toBe('/images/products/coffee.jpg');
});
