"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { resolveProductImage } from "../../lib/safe-image";

export function ProductImagePicker({ current, file, disabled, onChange }: { current: string; file: File | null; disabled: boolean; onChange: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  function select(files: FileList | null) {
    if (disabled || !files?.length) return;
    if (files.length !== 1) { setError("Chỉ chọn một ảnh sản phẩm."); return; }
    const next = files[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type) || next.size === 0 || next.size > 5 * 1024 * 1024) { setError("Chọn ảnh JPG, PNG hoặc WebP, tối đa 5 MB."); return; }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(next);
    setPreview(objectUrl.current); setError(""); onChange(next);
  }
  const src = file ? preview : resolveProductImage(current);
  return <div className="product-image-picker"><span className="product-image-label">Ảnh sản phẩm</span>
    <div className="product-image-picker-row">
      <div className={`product-image-drop${dragging ? " is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files); }}>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Chọn ảnh sản phẩm" disabled={disabled} onChange={(event) => { select(event.target.files); event.target.value = ""; }} hidden />
        <button type="button" disabled={disabled} onClick={() => input.current?.click()}>{src ? "Đổi ảnh" : "Tải ảnh lên"}</button>
        <small>Hoặc kéo thả ảnh vào đây</small><small>JPG, PNG, WebP · tối đa 5 MB</small>
      </div>
      {src && <img className="product-upload-preview" src={src} alt="Ảnh sản phẩm xem trước" width="160" height="160" />}
    </div>
    {file && <div className="product-upload-selection"><span>{file.name}</span><button type="button" className="inventory-cancel" disabled={disabled} onClick={() => { onChange(null); setError(""); }}>Hủy đổi ảnh</button></div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
