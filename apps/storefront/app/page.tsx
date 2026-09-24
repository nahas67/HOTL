"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Leaf,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  X,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  description: string;
  image?: string;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );
export default function Storefront() {
  const [products, setProducts] = useState<Product[]>([]),
    [mode, setMode] = useState("simulation");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [category, setCategory] = useState("All objects");
  const [cart, setCart] = useState<Record<string, number>>({}),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [order, setOrder] = useState("");
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [destinationCountry, setDestinationCountry] = useState("");
  const checkoutKey = useRef("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem("hotl-cart") ?? "{}"));
    } catch {
      /* An invalid local cart is discarded. */
    }
    fetch("/api/products")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message);
        setProducts(d.products);
        setMode(d.mode);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (open) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [open]);
  function change(id: string, amount: number) {
    setOrder("");
    checkoutKey.current = "";
    setCart((old) => {
      const next = {
        ...old,
        [id]: Math.max(0, Math.min(20, (old[id] ?? 0) + amount)),
      };
      localStorage.setItem("hotl-cart", JSON.stringify(next));
      return next;
    });
  }
  const selected = products.filter((p) => cart[p.id] > 0),
    count = selected.reduce((n, p) => n + cart[p.id], 0),
    total = selected.reduce((n, p) => n + p.price * cart[p.id], 0);
  async function checkout(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({
        customer: { name, email },
        items: selected.map(p => ({ productId: p.id, quantity: cart[p.id] })),
        ...(destinationCountry ? { destinationCountry } : {}),
      });
      const saved = JSON.parse(localStorage.getItem('hotl-checkout-retry') ?? 'null') as { body: string; key: string } | null;
      checkoutKey.current = saved?.body === body ? saved.key : crypto.randomUUID();
      localStorage.setItem('hotl-checkout-retry', JSON.stringify({ body, key: checkoutKey.current }));
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": checkoutKey.current,
        },
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "Checkout could not be completed.",
        );
      setOrder(result.order?.number ?? result.order?.id ?? result.orderId);
      setCart({});
      localStorage.removeItem("hotl-cart");
      localStorage.removeItem('hotl-checkout-retry');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="announcement">
        {mode === "simulation"
          ? "An interactive demo store · No real payments or shipments"
          : "Considered objects. Everyday living."}
      </div>
      <header className="store-header">
        <a className="wordmark" href="/">
          everyday<span>®</span>
        </a>
        <nav>
          <a href="#collection">The collection</a>
          <a href="#philosophy">Our approach</a>
        </nav>
        <button className="bag" onClick={() => setOpen(true)}>
          <ShoppingBag size={18} /> Your bag <span>{count}</span>
        </button>
      </header>
      <main>
        <section className="store-hero">
          <div className="eyebrow">FEWER THINGS. BETTER DAYS.</div>
          <h1>
            A little more
            <br />
            <em>intentional.</em>
          </h1>
          <p>
            Useful, beautiful objects that make the everyday
            <br className="desktop" /> feel a little less ordinary.
          </p>
          <a className="shop-link" href="#collection">
            Explore the collection <ArrowDown size={17} />
          </a>
          <div className="hero-art" aria-hidden="true">
            <div className="sun-disc" />
            <div className="vase">
              <i />
              <b />
            </div>
            <div className="stem s1" />
            <div className="stem s2" />
            <div className="stem s3" />
            <div className="art-label">
              GOOD THINGS,
              <br />
              CHOSEN WELL.
            </div>
          </div>
          <div className="hero-foot">
            <span>THE EVERYDAY EDIT — 001</span>
            <span>Thoughtfully sourced. Simply enjoyed.</span>
          </div>
        </section>
        <section id="collection" className="collection">
          <div className="section-title">
            <div>
              <div className="eyebrow">THE COLLECTION</div>
              <h2>Find your everyday.</h2>
            </div>
            <span>{products.length} considered essentials</span>
          </div>
          <div className="categories">
            {[
              "All objects",
              ...new Set(products.map((p) => p.category).filter(Boolean)),
            ].map((c) => (
              <button
                className={c === category ? "selected" : ""}
                key={c}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          {error && !open && (
            <p role="alert" className="error">
              {error}{" "}
              <button onClick={() => location.reload()}>Try again</button>
            </p>
          )}
          <div className="product-grid">
            {loading
              ? [0, 1, 2].map((i) => (
                  <div className="product-placeholder" key={i} />
                ))
              : products
                  .filter(
                    (p) =>
                      category === "All objects" || p.category === category,
                  )
                  .map((p, i) => (
                    <article key={p.id} className="product">
                      <div className={`product-art tone-${i % 4}`}>
                        <span className="product-index">
                          0{i + 1} / EVERYDAY
                        </span>
                        {p.image ? <img className="product-illustration" src={p.image} alt={p.name} width={270} height={270} /> : <Package size={94} strokeWidth={0.8} aria-label={p.name} />}
                        <button
                          aria-label={`Add ${p.name} to bag`}
                          disabled={p.stock <= 0}
                          onClick={() => change(p.id, 1)}
                        >
                          {cart[p.id] ? (
                            <Check size={19} />
                          ) : (
                            <Plus size={19} />
                          )}
                        </button>
                      </div>
                      <div className="product-title">
                        <h3>{p.name}</h3>
                        <span>{money(p.price)}</span>
                      </div>
                      <p>{p.category || "Everyday essential"}</p>
                      <button
                        className="add-link"
                        onClick={() => change(p.id, 1)}
                        disabled={p.stock <= 0}
                      >
                        {p.stock <= 0
                          ? "Currently unavailable"
                          : cart[p.id]
                            ? `${cart[p.id]} in your bag · Add one more`
                            : "Add to bag"}{" "}
                        <ArrowRight size={14} />
                      </button>
                    </article>
                  ))}
          </div>
          {!loading && !error && products.length === 0 && (
            <p>Our next collection is being prepared. Check back soon.</p>
          )}
        </section>
        <section id="philosophy" className="philosophy">
          <Leaf size={28} strokeWidth={1.2} />
          <div className="eyebrow">A SMALLER, BETTER COLLECTION</div>
          <h2>
            Made for the moments
            <br />
            in between.
          </h2>
          <p>
            We believe the things you surround yourself with should earn their
            place. Our collection brings together simple, useful objects for the
            rituals that make a day your own.
          </p>
        </section>
      </main>
      <footer>
        <a className="wordmark" href="/">
          everyday<span>®</span>
        </a>
        <span>A storefront powered by HOTL.</span>
        <span>
          {mode === "simulation"
            ? "Demonstration collection"
            : "Considered commerce"}
        </span>
      </footer>
      <dialog
        ref={dialogRef}
        className="cart-dialog"
        onCancel={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
      >
        <div className="cart-body">
          <div className="cart-heading">
            <h2>
              Your bag <span>({count})</span>
            </h2>
            <button aria-label="Close bag" onClick={() => setOpen(false)}>
              <X size={20} />
            </button>
          </div>
          {order ? (
            <div className="order-success">
              <Check size={40} />
              <h3>Your demo order is confirmed.</h3>
              <p>Order {order}</p>
              <p>
                No payment was collected. You can find this order in the HOTL
                owner cockpit.
              </p>
              <button className="checkout" onClick={() => setOpen(false)}>
                Continue exploring
              </button>
            </div>
          ) : (
            <>
              {selected.length === 0 ? (
                <div className="empty-bag">
                  <ShoppingBag size={40} strokeWidth={1} />
                  <p>A little room for something good.</p>
                  <button onClick={() => setOpen(false)}>
                    Explore the collection <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="cart-items">
                    {selected.map((p) => (
                      <div className="cart-item" key={p.id}>
                        <div className="cart-thumb">
                          {p.image ? <img src={p.image} alt="" width={75} height={82} /> : <Package size={32} strokeWidth={1} />}
                        </div>
                        <div>
                          <h3>{p.name}</h3>
                          <span>{money(p.price)}</span>
                          <div className="quantity">
                            <button
                              aria-label={`Remove one ${p.name}`}
                              onClick={() => change(p.id, -1)}
                            >
                              <Minus size={13} />
                            </button>
                            {cart[p.id]}
                            <button
                              aria-label={`Add one ${p.name}`}
                              onClick={() => change(p.id, 1)}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                        <strong>{money(p.price * cart[p.id])}</strong>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={checkout}>
                    <div className="cart-total">
                      <span>Total</span>
                      <strong>{money(total)}</strong>
                    </div>
                    <label htmlFor="name">Your name</label>
                    <input
                      id="name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        checkoutKey.current = "";
                      }}
                      required
                      maxLength={100}
                      autoComplete="name"
                    />
                    <label htmlFor="email">Email address</label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        checkoutKey.current = "";
                      }}
                      required
                      autoComplete="email"
                    />
                    <label htmlFor="destination-country">
                      Destination country (2-letter code)
                    </label>
                    <input
                      id="destination-country"
                      name="destinationCountry"
                      value={destinationCountry}
                      onChange={(e) => {
                        setDestinationCountry(e.target.value.toUpperCase());
                        checkoutKey.current = "";
                      }}
                      minLength={2}
                      maxLength={2}
                      pattern="[A-Z]{2}"
                      placeholder="e.g. US or IN"
                      title="Enter a two-letter country code, such as US or IN."
                      autoComplete="shipping country"
                    />
                    {error && (
                      <p className="error" role="alert">
                        {error}
                      </p>
                    )}
                    <button className="checkout" disabled={busy}>
                      {busy ? "Placing your order…" : "Place demo order"}{" "}
                      <ArrowRight size={16} />
                    </button>
                    <p className="checkout-note">
                      Simulation checkout. No card, charge, or shipment.
                    </p>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
