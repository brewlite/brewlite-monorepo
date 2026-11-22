"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { CenteredDialog } from "../ui/centered-dialog";
import { useAuthUser, useAuthStatus, refreshAuth } from "../../lib/auth-store";
import { authError } from "../../services/auth.service";
import { getStore } from "../../services/store.service";
import {
  cartPayload as payload,
  mergeGuestCart,
  guestMergePending,
  executeCartCommand,
  pendingCartCommand,
  type ServerCart,
} from "../../services/cart.service";
import { parsePrice } from "../../lib/format-price";
import {
  addConfiguredLine,
  cartCount,
  cartSubtotal,
  changeLineQuantity,
  removeLine,
  replaceConfiguredLine,
  type CartLine,
  type NewCartLine,
} from "../../lib/cart-config";

const STORAGE_KEY = "brewlite-config-cart";
export const STAFF_CART_STORAGE_KEY = "brewlite-staff-pos-cart";
const EMPTY: CartLine[] = [];

type StaffCartRecord = { ownerId: string; lines: CartLine[] };
const EMPTY_STAFF: StaffCartRecord = { ownerId: "", lines: EMPTY };

function isCartLine(item: unknown): item is CartLine {
  const i = item as Partial<CartLine> | null;
  return Boolean(
    i &&
      typeof i.key === "string" &&
      typeof i.productId === "string" &&
      typeof i.quantity === "number" &&
      typeof i.unitPrice === "number" &&
      Array.isArray(i.toppings),
  );
}

let snapshot: CartLine[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function getSnapshot() {
  if (!hydrated) {
    hydrated = true;
    try {
      const parsed: unknown = JSON.parse(
        sessionStorage.getItem(STORAGE_KEY) || "[]",
      );
      if (Array.isArray(parsed)) snapshot = parsed.filter(isCartLine);
    } catch {
      snapshot = EMPTY;
    }
  }
  return snapshot;
}
function commit(lines: CartLine[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  snapshot = lines.length ? lines : EMPTY;
  listeners.forEach((fn) => fn());
}

let staffSnapshot: StaffCartRecord = EMPTY_STAFF;
let staffHydrated = false;
const staffListeners = new Set<() => void>();
function subscribeStaff(fn: () => void) {
  staffListeners.add(fn);
  return () => {
    staffListeners.delete(fn);
  };
}
function getStaffSnapshot(): StaffCartRecord {
  if (!staffHydrated) {
    staffHydrated = true;
    try {
      const parsed: unknown = JSON.parse(
        sessionStorage.getItem(STAFF_CART_STORAGE_KEY) || "null",
      );
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as StaffCartRecord).ownerId === "string" &&
        Array.isArray((parsed as StaffCartRecord).lines)
      ) {
        const valid = (parsed as StaffCartRecord).lines.filter(isCartLine);
        staffSnapshot = {
          ownerId: (parsed as StaffCartRecord).ownerId,
          lines: valid.length ? valid : EMPTY,
        };
      }
    } catch {
      staffSnapshot = EMPTY_STAFF;
    }
  }
  return staffSnapshot;
}
function readStaffLines(ownerId: string): CartLine[] {
  const record = getStaffSnapshot();
  return record.ownerId === ownerId ? record.lines : EMPTY;
}
function commitStaff(ownerId: string, lines: CartLine[]) {
  const record: StaffCartRecord = {
    ownerId,
    lines: lines.length ? lines : EMPTY,
  };
  sessionStorage.setItem(STAFF_CART_STORAGE_KEY, JSON.stringify(record));
  staffSnapshot = record;
  staffListeners.forEach((fn) => fn());
}

const cartLines = (cart: ServerCart): CartLine[] =>
  cart.items.map((i) => ({
    ...i,
    unitPrice: parsePrice(i.unitPrice),
    toppings: i.toppings.map((t) => ({ ...t, price: parsePrice(t.price) })),
  }));

type Context = {
  lines: CartLine[];
  version: number;
  ready: boolean;
  busy: boolean;
  canCheckout: boolean;
  isStaffPos?: boolean;
  pendingGuest: CartLine[];
  retry: () => void;
  count: number;
  subtotal: number;
  isOpen: boolean;
  toast: string | null;
  lastAdded: NewCartLine | null;
  reload: () => Promise<void>;
  dismissToast: () => void;
  openCart: () => void;
  closeCart: () => void;
  addLine: (line: NewCartLine) => Promise<void>;
  updateLine: (key: string, line: NewCartLine) => Promise<boolean>;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const CartContext = createContext<Context | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const local = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const staffRecord = useSyncExternalStore(
    subscribeStaff,
    getStaffSnapshot,
    () => EMPTY_STAFF,
  );
  const user = useAuthUser();
  const auth = useAuthStatus();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const customer = user?.role === "CUSTOMER";
  const staff = user?.role === "STAFF";
  const actor = user?.id;
  const [remote, setRemote] = useState<{
    userId: string;
    cart: ServerCart;
  } | null>(null);
  const [syncError, setSyncError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [isOpen, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<NewCartLine | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<CartLine | null>(null);
  const serverCart =
    customer && user && remote?.userId === user.id ? remote.cart : null;
  const staffLines =
    staff && actor && staffRecord.ownerId === actor ? staffRecord.lines : EMPTY;
  const lines = useMemo(
    () =>
      customer
        ? serverCart
          ? cartLines(serverCart)
          : EMPTY
        : staff
          ? staffLines
          : user
            ? EMPTY
            : local,
    [customer, staff, user, serverCart, staffLines, local],
  );

  async function reload() {
    if (customer && user) {
      const cart = await getStore<ServerCart>("/cart");
      setRemote({ userId: user.id, cart });
    }
  }

  useEffect(() => {
    if (!customer || !actor) return;
    const actorId = actor;
    let active = true;
    async function sync() {
      try {
        const command = pendingCartCommand(actorId);
        let cart = command
          ? await executeCartCommand(actorId, command)
          : await getStore<ServerCart>("/cart");
        if (!active) return;
        setBusy(true);
        setRemote({ userId: actorId, cart });
        cart = await mergeGuestCart(
          actorId,
          cart,
          getSnapshot(),
          getSnapshot,
          commit,
        );
        if (active) {
          setRemote({ userId: actorId, cart });
          setSyncError("");
        }
      } catch (error) {
        if (active)
          setSyncError(
            error instanceof Error && !("response" in error)
              ? error.message
              : authError(error),
          );
      } finally {
        if (active) setBusy(false);
      }
    }
    void sync();
    return () => {
      active = false;
    };
  }, [customer, actor, attempt]);

  useEffect(() => {
    if (!customer || !actor) return;
    let active = true;
    const sync = () => {
      void getStore<ServerCart>("/cart")
        .then((cart) => {
          if (active) setRemote({ userId: actor, cart });
        })
        .catch(() => {
          if (active) setSyncError("Không thể đồng bộ giỏ hàng. Vui lòng thử lại.");
        });
    };
    window.addEventListener("brewlite:cart-updated", sync);
    return () => {
      active = false;
      window.removeEventListener("brewlite:cart-updated", sync);
    };
  }, [customer, actor]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function mutation(
    path: string,
    body: object,
    method: "post" | "patch" | "delete",
  ) {
    if (!customer || !serverCart)
      throw new Error(
        "Giỏ hàng chưa đồng bộ hoặc tài khoản không có quyền mua hàng.",
      );
    if (inFlight.current) throw new Error("Đang lưu giỏ hàng. Vui lòng chờ.");
    if (pendingCartCommand(user.id))
      throw new Error(
        "Yêu cầu trước chưa được xác nhận. Hãy thử đồng bộ lại trước khi sửa tiếp.",
      );
    inFlight.current = true;
    setBusy(true);
    try {
      const cart = await executeCartCommand(user.id, {
        path,
        body: { ...body, expectedVersion: serverCart.version },
        method,
        key: crypto.randomUUID(),
      });
      setRemote({ userId: user.id, cart });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const value: Context = {
    lines,
    version: serverCart?.version ?? 0,
    ready: auth.ready && !auth.error && (!customer || !!serverCart),
    busy,
    canCheckout:
      (!user || customer || staff) &&
      auth.ready &&
      !auth.error &&
      !syncError &&
      !busy &&
      (!customer || !pendingCartCommand(user!.id)) &&
      (!customer || local.length === 0) &&
      !!lines.length &&
      lines.every(
        (line) =>
          !!line.sizeId && !line.requiresConfiguration && line.isValid !== false,
      ),
    isStaffPos: staff,
    pendingGuest: customer ? local : EMPTY,
    retry: () => {
      setSyncError("");
      void refreshAuth()
        .then(() => setAttempt((a) => a + 1))
        .catch((error) => setSyncError(authError(error)));
    },
    reload,
    count: cartCount(lines),
    subtotal: cartSubtotal(lines),
    isOpen,
    toast,
    lastAdded,
    dismissToast: () => setToast(null),
    openCart: () => setOpen(true),
    closeCart: () => setOpen(false),
    addLine: async (line) => {
      try {
        if (!auth.ready || auth.error)
          throw new Error("Chưa kiểm tra được phiên đăng nhập. Vui lòng thử lại.");
        if (staff && actor) {
          const next = addConfiguredLine(readStaffLines(actor), line);
          commitStaff(actor, next.lines);
          if (next.capped) {
            setToast(null);
            setSyncError(
              "Mỗi cấu hình tối đa 20 ly. Giỏ được giữ nguyên, không cắt số lượng.",
            );
            return;
          }
        } else if (user) {
          await mutation("/cart/items", payload(line), "post");
        } else {
          const next = addConfiguredLine(getSnapshot(), line);
          commit(next.lines);
          if (next.capped) {
            setToast(null);
            setSyncError(
              "Mỗi cấu hình tối đa 20 ly. Giỏ được giữ nguyên, không cắt số lượng.",
            );
            return;
          }
        }
        setLastAdded(line);
        setToast(
          staff
            ? "Đã thêm vào giỏ tại quầy"
            : "Thêm vào giỏ hàng thành công",
        );
      } catch (error) {
        setSyncError(authError(error));
      }
    },
    updateLine: async (key, line) => {
      try {
        if (key.startsWith("guest:")) {
          if (guestMergePending())
            throw new Error(
              "Cần xác nhận kết quả đồng bộ trước khi chỉnh bản nháp. Hãy thử đồng bộ lại.",
            );
          const next = replaceConfiguredLine(getSnapshot(), key.slice(6), line);
          if (!next) return false;
          commit(next);
          return true;
        }
        if (staff && actor) {
          const next = replaceConfiguredLine(readStaffLines(actor), key, line);
          if (!next) return false;
          commitStaff(actor, next);
        } else if (user) {
          await mutation(`/cart/items/${key}`, payload(line), "patch");
        } else {
          const next = replaceConfiguredLine(getSnapshot(), key, line);
          if (!next) return false;
          commit(next);
        }
        setLastAdded(line);
        setToast("Cập nhật món thành công");
        return true;
      } catch (error) {
        setSyncError(authError(error));
        return false;
      }
    },
    setQuantity: (key, quantity) => {
      if (!Number.isInteger(quantity)) return;
      if (quantity > 20) {
        setSyncError("Mỗi cấu hình tối đa 20 ly; số lượng không bị cắt ngầm.");
        return;
      }
      const line = lines.find((i) => i.key === key);
      if (!line) return;
      if (quantity < 1) {
        setToast(null);
        setPendingRemoval(line);
        return;
      }
      if (staff && actor) {
        commitStaff(actor, changeLineQuantity(readStaffLines(actor), key, quantity));
      } else if (user) {
        void mutation(
          `/cart/items/${key}`,
          payload({ ...line, quantity }),
          "patch",
        ).catch((error) => setSyncError(authError(error)));
      } else {
        commit(changeLineQuantity(lines, key, quantity));
      }
    },
    remove: (key) => {
      setToast(null);
      const line = key.startsWith("guest:")
        ? getSnapshot().find((i) => i.key === key.slice(6))
        : lines.find((i) => i.key === key);
      setPendingRemoval(line ? { ...line, key } : null);
    },
    clear: () => {
      if (!user) commit([]);
      else if (staff && actor) commitStaff(actor, []);
      else setSyncError("Hãy xóa từng món để xác nhận thay đổi giỏ hàng.");
    },
  };

  return (
    <CartContext.Provider value={value}>
      {children}
      {auth.error && (
        <p className="notice notice-warn" role="alert">
          {auth.error}{" "}
          <button type="button" onClick={value.retry}>
            Thử lại
          </button>
        </p>
      )}
      {syncError && (
        <CenteredDialog
          label="Đồng bộ giỏ hàng"
          onClose={() => setSyncError("")}
        >
          <p role="alert">{syncError || auth.error}</p>
          {!staff && <p>Giỏ khách được giữ lại khi gộp thất bại.</p>}
          <button
            onClick={() => {
              setSyncError("");
              value.retry();
            }}
          >
            Thử đồng bộ lại
          </button>
        </CenteredDialog>
      )}
      {pendingRemoval && (
        <CenteredDialog
          label="Xác nhận xóa món"
          onClose={() => setPendingRemoval(null)}
        >
          <div className="remove-confirmation">
            <h2>Xóa món khỏi giỏ hàng?</h2>
            <p>
              Bạn có muốn xóa “{pendingRemoval.name.trim()}” khỏi giỏ hàng
              không?
            </p>
            <div className="notice-actions">
              <button onClick={() => setPendingRemoval(null)}>Hủy</button>
              <button
                className="notice-primary"
                onClick={() => {
                  if (pendingRemoval.key.startsWith("guest:")) {
                    if (guestMergePending()) {
                      setSyncError(
                        "Hãy thử đồng bộ lại để xác nhận yêu cầu trước trước khi bỏ bản nháp.",
                      );
                      return;
                    }
                    commit(removeLine(getSnapshot(), pendingRemoval.key.slice(6)));
                  } else if (staff && actor) {
                    commitStaff(
                      actor,
                      removeLine(readStaffLines(actor), pendingRemoval.key),
                    );
                  } else if (user) {
                    void mutation(
                      `/cart/items/${pendingRemoval.key}`,
                      {},
                      "delete",
                    ).catch((error) => setSyncError(authError(error)));
                  } else {
                    commit(removeLine(getSnapshot(), pendingRemoval.key));
                  }
                  setPendingRemoval(null);
                }}
              >
                Xóa món
              </button>
            </div>
          </div>
        </CenteredDialog>
      )}
    </CartContext.Provider>
  );
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used within CartProvider");
  return value;
}
