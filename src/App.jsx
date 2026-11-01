import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft, ArrowRight, CaretDown, Check, CreditCard, EnvelopeSimple,
  FacebookLogo, HandCoins, Heart, InstagramLogo, List, MagnifyingGlass,
  Lightning, MapPin, Minus, Package, Phone, Plus, ShieldCheck, ShoppingBag,
  SlidersHorizontal, TiktokLogo, Trash, Truck, WhatsappLogo, X,
} from "@phosphor-icons/react";
import storeData from "../data/store.json";
import { colorOptionFor, imagesForColor, thumbnailForColor } from "./product-colors.js";
import { generalWhatsAppMessage, productWhatsAppMessage, whatsAppHref } from "./whatsapp.js";
import { cartItemUnavailable, checkoutLines, displayPriceForSelection, validateDirectPurchase } from "./purchase.js";

const categoryOrder = ["ملابس-رجالية", "women", "kids"];
const fallbackCategories = [...storeData.categories].sort((a, b) => categoryOrder.indexOf(a.slug) - categoryOrder.indexOf(b.slug));
const money = new Intl.NumberFormat("ar-MA", { style: "currency", currency: "MAD", maximumFractionDigits: 2 });

const pageMeta = {
  "/": ["MELYNE | أزياء عصرية لكل العائلة", "تسوقوا كتالوج MELYNE للنساء والرجال والأطفال بالأسعار والمقاسات المتاحة."],
  "/shop": ["المتجر | MELYNE", "تصفحوا كامل كتالوج MELYNE المتاح للنساء والرجال والأطفال."],
  "/wishlist": ["المفضلة | MELYNE", "المنتجات المحفوظة في قائمة المفضلة."],
  "/cart": ["السلة | MELYNE", "مراجعة منتجات سلة MELYNE واختيارات المقاس واللون."],
  "/checkout": ["إتمام الطلب المحلي التجريبي | MELYNE", "يُحفظ طلب الدفع عند الاستلام محلياً فقط؛ لا يُرسل إلى المتجر الحقيقي ولا يُحصّل أي مبلغ."],
};

function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initialValue;
    } catch { return initialValue; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

function useRoute() {
  const current = () => `${window.location.pathname}${window.location.search}`;
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const sync = () => setRoute(current());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const navigate = (to) => {
    if (`${window.location.pathname}${window.location.search}` !== to) window.history.pushState({}, "", to);
    setRoute(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return [route, navigate];
}

function Link({ to, navigate, children, className, ariaLabel, onClick }) {
  return (
    <a href={to} className={className} aria-label={ariaLabel} onClick={(event) => {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
        event.preventDefault(); onClick?.(); navigate(to);
      }
    }}>{children}</a>
  );
}

const formatPrice = (value) => value == null ? "السعر غير متوفر" : money.format(value);
const productPath = (product) => `/products/${encodeURIComponent(product.slug)}`;
const getProduct = (products, id) => products.find((product) => product.id === id);
const variantCanBeBought = (variant) => !variant.retired && variant.availability === "available" && Number.isInteger(variant.stockQuantity) && variant.stockQuantity > 0;
const productHasStock = (product) => product.availability === "available" && product.variants.some(variantCanBeBought);
const availableVariant = (product) => product.variants.find(variantCanBeBought) || null;
const quantityFor = (items) => items.reduce((sum, item) => sum + item.quantity, 0);

function WhatsAppLink({ href, product = false }) {
  if (!href) return null;
  return <a className={product ? "whatsapp-product-link" : "whatsapp-float"} href={href} target="_blank" rel="noopener noreferrer" aria-label={product ? "استفسر عن هذا المنتج عبر واتساب" : "تواصل مع MELYNE عبر واتساب"} title={product ? undefined : "تواصل معنا عبر واتساب"}><WhatsappLogo size={product ? 23 : 30} weight="fill" />{product && <span>استفسر عن هذا المنتج عبر واتساب</span>}</a>;
}

function AnnouncementBar() {
  return <div className="announcement" role="status"><span><Truck size={18} weight="light" /> التوصيل إلى مدن المغرب</span><span className="announcement-separator" aria-hidden="true" /><span><HandCoins size={18} weight="light" /> الدفع عند الاستلام</span></div>;
}

function Header({ navigate, cart, wishlist, onMenu, onSearch }) {
  const [query, setQuery] = useState("");
  const submit = (event) => { event.preventDefault(); if (query.trim()) navigate(`/shop?search=${encodeURIComponent(query.trim())}`); };
  return <><AnnouncementBar /><header className="site-header">
    <div className="header-main shell">
      <form className="header-search" role="search" onSubmit={submit}><MagnifyingGlass size={21} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن منتجات..." aria-label="البحث عن منتجات" /></form>
      <button className="mobile-icon menu-trigger" onClick={onMenu} aria-label="فتح القائمة"><List size={27} /></button>
      <Link to="/" navigate={navigate} className="brand-link" ariaLabel="MELYNE - الرئيسية"><img src={storeData.logo.localPath} alt="MELYNE" className="brand-logo" /></Link>
      <div className="header-actions">
        <Link to="/cart" navigate={navigate} className="header-action" ariaLabel={`السلة، ${quantityFor(cart)} منتجات`}><span className="icon-count-wrap"><ShoppingBag size={27} weight="light" />{quantityFor(cart) > 0 && <b>{quantityFor(cart)}</b>}</span><span>السلة</span></Link>
        <Link to="/wishlist" navigate={navigate} className="header-action" ariaLabel={`المفضلة، ${wishlist.length} منتجات`}><span className="icon-count-wrap"><Heart size={27} weight="light" />{wishlist.length > 0 && <b>{wishlist.length}</b>}</span><span>المفضلة</span></Link>
        <button className="header-action account-button" onClick={() => navigate("/pages/اتصل-بنا")} aria-label="تواصل معنا"><EnvelopeSimple size={27} weight="light" /><span>تواصل معنا</span></button>
      </div>
      <button className="mobile-icon search-trigger" onClick={onSearch} aria-label="فتح البحث"><MagnifyingGlass size={25} /></button>
    </div>
    <nav className="desktop-nav" aria-label="التنقل الرئيسي"><Link to="/" navigate={navigate}>الرئيسية</Link><Link to="/shop/women" navigate={navigate}>النساء</Link><Link to="/shop/ملابس-رجالية" navigate={navigate}>الرجال</Link><Link to="/shop/kids" navigate={navigate}>الأطفال</Link><Link to="/pages/اتصل-بنا" navigate={navigate}>تواصل معنا</Link></nav>
  </header></>;
}

function CheckoutHeader({ navigate, directMode }) {
  return <header className="checkout-header"><div className="checkout-header-inner shell"><Link to={directMode ? "/shop" : "/cart"} navigate={navigate} className="checkout-back"><ArrowRight size={18} /> {directMode ? "متابعة التسوق" : "العودة إلى السلة"}</Link><Link to="/" navigate={navigate} className="checkout-brand" ariaLabel="MELYNE - الرئيسية"><img src={storeData.logo.localPath} alt="MELYNE" /></Link><span className="checkout-header-context">إتمام الطلب المحلي</span></div></header>;
}

function MobilePanel({ open, type, onClose, navigate }) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = previousOverflow; };
  }, [open, onClose]);
  if (!open) return null;
  const search = (event) => { event.preventDefault(); if (query.trim()) { navigate(`/shop?search=${encodeURIComponent(query.trim())}`); onClose(); } };
  return <div className="panel-layer" role="dialog" aria-modal="true" aria-label={type === "search" ? "البحث" : "القائمة"}>
    <button className="panel-scrim" aria-label="إغلاق" onClick={onClose} />
    <aside className={`mobile-panel ${type === "search" ? "search-panel" : ""}`}><div className="panel-head"><img src={storeData.logo.localPath} alt="MELYNE" /><button className="icon-button" onClick={onClose} aria-label="إغلاق"><X size={25} /></button></div>
      {type === "search" ? <form className="panel-search" onSubmit={search}><MagnifyingGlass size={22} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ما الذي تبحث عنه؟" aria-label="البحث عن منتجات" /><button className="primary-button" type="submit">بحث</button></form> : <nav className="mobile-nav" aria-label="التنقل على الهاتف">{[["/", "الرئيسية"], ["/shop", "كل المنتجات"], ["/shop/women", "النساء"], ["/shop/ملابس-رجالية", "الرجال"], ["/shop/kids", "الأطفال"], ["/wishlist", "المفضلة"], ["/cart", "السلة"], ["/pages/اتصل-بنا", "تواصل معنا"]].map(([to, label]) => <Link key={to} to={to} navigate={navigate} onClick={onClose}>{label}<ArrowLeft size={18} /></Link>)}</nav>}
    </aside>
  </div>;
}

function ReferenceCrop({ className, alt, src }) {
  return <span className={`reference-crop ${className}`}><img src={src} alt={alt} /></span>;
}

function Hero({ navigate, banner }) {
  if (banner) return <section className="hero shell-wide managed-hero" aria-labelledby="hero-title">
    <div className="hero-copy"><h1 id="hero-title">{banner.headingAr}</h1>{banner.supportingTextAr && <p>{banner.supportingTextAr}</p>}{banner.buttonLabelAr && banner.destinationUrl && (banner.destinationUrl.startsWith("https://") ? <a href={banner.destinationUrl} className="primary-button hero-button">{banner.buttonLabelAr}</a> : <Link to={banner.destinationUrl} navigate={navigate} className="primary-button hero-button">{banner.buttonLabelAr}</Link>)}<div className="hero-trust"><span><HandCoins size={30} weight="light" /><b>الدفع عند<br />الاستلام</b></span><i aria-hidden="true" /><span><Truck size={31} weight="light" /><b>توصيل لجميع<br />مدن المغرب</b></span></div></div>
    <picture className="reference-crop hero-reference">{banner.mobileImageUrl && <source media="(max-width: 720px)" srcSet={banner.mobileImageUrl}/>}<img src={banner.desktopImageUrl} alt={banner.imageAltAr}/></picture>
  </section>;
  return <section className="hero shell-wide" aria-labelledby="hero-title">
    <div className="hero-copy"><h1 id="hero-title">إطلالات<br />لكل العائلة</h1><p>أزياء عصرية ومريحة للنساء والرجال والأطفال بأسلوب مغربي عصري</p><Link to="/shop" navigate={navigate} className="primary-button hero-button">تسوق الآن</Link><div className="hero-trust"><span><HandCoins size={30} weight="light" /><b>الدفع عند<br />الاستلام</b></span><i aria-hidden="true" /><span><Truck size={31} weight="light" /><b>توصيل لجميع<br />مدن المغرب</b></span></div></div>
    <ReferenceCrop className="hero-reference" src="/images/reference/hero-family-web.jpg" alt="عائلة ترتدي أزياء MELYNE" />
  </section>;
}

function CategoryTiles({ navigate, categories }) {
  const cropSources = { kids: "/images/reference/category-kids-web.jpg", women: "/images/reference/category-women-web.jpg", "ملابس-رجالية": "/images/reference/category-men-web.jpg" };
  const labels = { kids: "ملابس الأطفال", women: "ملابس النساء", "ملابس-رجالية": "ملابس الرجال" };
  return <section className="category-grid shell" aria-label="تسوق حسب الفئة" tabIndex="0">{categories.map((category) => <Link key={category.slug} to={`/shop/${encodeURIComponent(category.slug)}`} navigate={navigate} className="category-tile" ariaLabel={`تسوق ${labels[category.slug]}`}><ReferenceCrop className="category-reference" src={cropSources[category.slug]} alt="" /><span className="category-tile-label" aria-hidden="true">{labels[category.slug]}</span></Link>)}</section>;
}

function Price({ product, variant, compact = false }) {
  const { current, comparison } = displayPriceForSelection(product, variant);
  return <div className={`price-row ${compact ? "compact" : ""}`}><strong>{formatPrice(current)}</strong>{comparison && <del>{formatPrice(comparison)}</del>}</div>;
}

function ProductCard({ product, navigate, wished, toggleWishlist }) {
  const unavailable = !productHasStock(product);
  const image = product.images[0]?.localOptimizedPath || product.images[0]?.localOriginalPath;
  return <article className="product-card"><div className="product-image-wrap"><Link to={productPath(product)} navigate={navigate} ariaLabel={product.name}>{image ? <img src={image} alt={product.name} loading="lazy" /> : <span className="product-card-placeholder"><Package size={44} aria-hidden="true" /></span>}</Link>{(product.badgeText || product.price.comparison) && <span className="sale-badge" style={product.badgeText ? { backgroundColor: product.badgeColor || undefined } : undefined}>{product.badgeText || "خصم"}</span>}{unavailable && <span className="stock-badge">غير متوفر</span>}<button className={`wishlist-button ${wished ? "active" : ""}`} onClick={() => toggleWishlist(product.id)} aria-label={wished ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}><Heart size={20} weight={wished ? "fill" : "regular"} /></button><Link to={productPath(product)} navigate={navigate} className="quick-view" ariaLabel={`اختيار خيارات ${product.displayName}`}><ShoppingBag size={21} weight="light" /></Link></div><div className="product-card-body"><div><Link to={productPath(product)} navigate={navigate} className="product-name">{product.displayName}</Link><Price product={product} compact /></div></div></article>;
}

function ProductGrid({ items, navigate, wishlist, toggleWishlist }) {
  if (!items.length) return <div className="empty-state"><Package size={44} weight="light" /><h3>لا توجد منتجات مطابقة</h3><p>جرّب إزالة بعض الفلاتر أو كتابة عبارة بحث أخرى.</p></div>;
  return <div className="product-grid">{items.map((product) => <ProductCard key={product.id} product={product} navigate={navigate} wished={wishlist.includes(product.id)} toggleWishlist={toggleWishlist} />)}</div>;
}

function Featured({ navigate, wishlist, toggleWishlist, featuredProducts }) {
  return <section className="shell section-space featured-section" aria-labelledby="featured-title"><div className="section-heading"><Link to="/shop" navigate={navigate} className="text-link">عرض الكل <ArrowLeft size={17} /></Link><div><span>اختيارات من الكتالوج</span><h2 id="featured-title">الأكثر مبيعاً</h2><p>قطع مختارة للعائلة من أحدث منتجات MELYNE.</p></div><span className="heading-balance" /></div><ProductGrid items={featuredProducts} navigate={navigate} wishlist={wishlist} toggleWishlist={toggleWishlist} /></section>;
}

function Services() {
  return <section className="services-strip shell section-space" aria-label="مزايا المتجر"><div><Truck size={32} weight="light" /><span><strong>التوصيل السريع</strong><small>وفق معلومات المتجر: 24 إلى 48 ساعة بعد التأكيد</small></span></div><div><ShieldCheck size={32} weight="light" /><span><strong>جودة مختارة</strong><small>صور ومعلومات المنتجات من كتالوج MELYNE</small></span></div><div><Package size={32} weight="light" /><span><strong>الاستبدال</strong><small>تطبق شروط سياسة الاستبدال المنشورة</small></span></div></section>;
}

function HomePage(props) { return <main><Hero navigate={props.navigate} banner={props.banners[0]} /><CategoryTiles navigate={props.navigate} categories={props.categories} /><Featured {...props} /><Services /></main>; }

function getOptions(product, matcher) { return product.options.filter((option) => matcher(option)).flatMap((option) => option.values.map((value) => value.label)).filter(Boolean); }

function FilterGroup({ title, values, selected, onToggle }) {
  return <fieldset className="filter-group"><legend>{title}</legend>{values.map((value) => <label key={value} className="check-line"><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} /><span>{value}</span></label>)}</fieldset>;
}

function CatalogPage({ slug, navigate, wishlist, toggleWishlist, products, categories }) {
  const params = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(params.get("search") || "");
  const [sort, setSort] = useState("featured");
  const [sizes, setSizes] = useState([]);
  const [colors, setColors] = useState([]);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterButtonRef = useRef(null);
  const filterDialogRef = useRef(null);
  useEffect(() => {
    if (!filtersOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    filterDialogRef.current?.querySelector("button")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); setFiltersOpen(false); return; }
      if (event.key !== "Tab") return;
      const controls = [...filterDialogRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); filterButtonRef.current?.focus(); };
  }, [filtersOpen]);
  const base = slug ? products.filter((product) => product.categories.some((category) => category.slug === slug)).sort((a, b) => (a.categoryPositions?.[slug] ?? a.order) - (b.categoryPositions?.[slug] ?? b.order) || a.id.localeCompare(b.id)) : products;
  const category = categories.find((entry) => entry.slug === slug);
  const allSizes = [...new Set(base.flatMap((product) => getOptions(product, (option) => option.key === "size" || /size|taille|مقاس/i.test(option.name || ""))))];
  const allColors = [...new Set(base.flatMap((product) => getOptions(product, (option) => option.key !== "size" && !/size|taille|مقاس/i.test(option.name || ""))))];
  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("ar");
    const result = base.filter((product) => {
      const searchable = `${product.name} ${product.displayName} ${product.sku || ""}`.toLocaleLowerCase("ar");
      if (normalized && !searchable.includes(normalized)) return false;
      if (availableOnly && !productHasStock(product)) return false;
      if (sizes.length && !sizes.some((size) => getOptions(product, (option) => option.key === "size" || /size|taille|مقاس/i.test(option.name || "")).includes(size))) return false;
      if (colors.length && !colors.some((color) => getOptions(product, (option) => option.key !== "size" && !/size|taille|مقاس/i.test(option.name || "")).includes(color))) return false;
      return true;
    });
    if (sort === "price-asc") return [...result].sort((a, b) => (a.price.current ?? Infinity) - (b.price.current ?? Infinity));
    if (sort === "price-desc") return [...result].sort((a, b) => (b.price.current ?? -Infinity) - (a.price.current ?? -Infinity));
    if (sort === "name") return [...result].sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
    return result;
  }, [base, search, sort, sizes, colors, availableOnly]);
  const toggle = (list, setter, value) => setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const clear = () => { setSizes([]); setColors([]); setAvailableOnly(false); setSearch(""); };
  const activeFilterCount = sizes.length + colors.length + Number(availableOnly);
  return <main className="catalog-page shell section-space">
    <div className="breadcrumbs"><Link to="/" navigate={navigate}>الرئيسية</Link><span>/</span><span>{category?.name || "كل المنتجات"}</span></div>
    <div className="catalog-title"><div><span>كتالوج MELYNE</span><h1>{category?.name || "كل المنتجات"}</h1><p>{base.length} منتجاً من الكتالوج العام</p></div>{category?.imageLocalOptimizedPath && <img src={category.imageLocalOptimizedPath} alt="" />}</div>
    <div className="catalog-toolbar">
      <button ref={filterButtonRef} type="button" className="filter-toggle" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-expanded={filtersOpen}><SlidersHorizontal size={19} aria-hidden="true" /> فلترة {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}</button>
      <label className="catalog-search"><MagnifyingGlass size={20} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث في هذه المجموعة" aria-label="البحث في هذه المجموعة" /></label>
      <label className="sort-select">ترتيب حسب <CaretDown size={15} /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">الأحدث</option><option value="price-asc">السعر: من الأقل</option><option value="price-desc">السعر: من الأعلى</option><option value="name">الاسم</option></select></label>
    </div>
    <div className="catalog-results"><div className="results-count" aria-live="polite">عرض {filtered.length} من {base.length}</div>
      {activeFilterCount > 0 && <div className="active-filters" aria-label="الفلاتر النشطة">{availableOnly && <button type="button" className="filter-chip" onClick={() => setAvailableOnly(false)}>المتاح فقط <X size={14} /></button>}{sizes.map((size) => <button key={`size-${size}`} type="button" className="filter-chip" onClick={() => toggle(sizes, setSizes, size)}>{size} <X size={14} /></button>)}{colors.map((color) => <button key={`color-${color}`} type="button" className="filter-chip" onClick={() => toggle(colors, setColors, color)}>{color} <X size={14} /></button>)}</div>}
      <ProductGrid items={filtered} navigate={navigate} wishlist={wishlist} toggleWishlist={toggleWishlist} />
    </div>
    {filtersOpen && <div className="filter-overlay"><button type="button" className="filter-scrim show" onClick={() => setFiltersOpen(false)} aria-label="إغلاق الفلاتر" /><aside ref={filterDialogRef} className="filters open" role="dialog" aria-modal="true" aria-label="فلاتر المنتجات"><div className="filters-head"><h2>تصفية المنتجات</h2><button type="button" className="icon-button" onClick={() => setFiltersOpen(false)} aria-label="إغلاق الفلاتر"><X size={21} /></button></div><div className="filters-body"><label className="check-line"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /><span>المتاح فقط</span></label>{allSizes.length > 0 && <FilterGroup title="المقاسات" values={allSizes} selected={sizes} onToggle={(value) => toggle(sizes, setSizes, value)} />}{allColors.length > 0 && <FilterGroup title="الألوان" values={allColors} selected={colors} onToggle={(value) => toggle(colors, setColors, value)} />}</div><div className="filter-actions"><button type="button" className="filter-apply primary-button" onClick={() => setFiltersOpen(false)}>تطبيق الفلاتر</button><button type="button" className="clear-filters" onClick={clear}>مسح الفلاتر</button></div></aside></div>}
  </main>;
}

function ProductPage({ product, navigate, wishlist, toggleWishlist, addToCart, beginBuyNow, products }) {
  const firstAvailable = availableVariant(product);
  const initialSelections = Object.fromEntries((firstAvailable?.selections || []).map((selection) => [selection.option, selection.value]));
  const [selected, setSelected] = useState(initialSelections);
  const [activeImageId, setActiveImageId] = useState(firstAvailable?.imageId || product.images[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [purchaseError, setPurchaseError] = useState("");
  const [isNavigating, startTransition] = useTransition();
  const colorOption = colorOptionFor(product);
  const selectedColor = colorOption ? selected[colorOption.name] : null;
  const galleryImages = imagesForColor(product, selectedColor);
  const matchedVariant = product.variants.find((variant) => variant.selections.every((selection) => selected[selection.option] === selection.value));
  const canBuy = product.availability === "available" && Boolean(matchedVariant && variantCanBeBought(matchedVariant));
  const maximumQuantity = Number.isFinite(matchedVariant?.stockQuantity) && matchedVariant.stockQuantity > 0 ? matchedVariant.stockQuantity : 99;
  const selectValue = (optionName, value) => {
    const next = { ...selected, [optionName]: value };
    if (colorOption?.name === optionName) {
      const sameSizeAvailable = product.variants.some((variant) => variantCanBeBought(variant) && variant.selections.every((selection) => next[selection.option] === selection.value));
      if (!sameSizeAvailable) product.options.filter((option) => option.name !== optionName).forEach((option) => { delete next[option.name]; });
    }
    const match = product.variants.find((variant) => variant.selections.every((selection) => next[selection.option] === selection.value));
    const nextImages = imagesForColor(product, colorOption ? next[colorOption.name] : null);
    const preferred = nextImages.find((image) => image.id === match?.imageId) || thumbnailForColor(product, colorOption ? next[colorOption.name] : null) || nextImages[0];
    setSelected(next);
    setPurchaseError("");
    setActiveImageId(preferred?.id);
  };
  const valueAvailable = (optionName, value) => product.variants.some((variant) => variantCanBeBought(variant) && variant.selections.every((selection) => selection.option === optionName ? selection.value === value : optionName === colorOption?.name || !selected[selection.option] || selection.value === selected[selection.option]));
  const image = galleryImages.find((entry) => entry.id === activeImageId) || galleryImages[0];
  const whatsAppProductHref = whatsAppHref(storeData.whatsappSupportNumber, productWhatsAppMessage(product, selected, storeData.domain));
  const buyNow = () => {
    const result = validateDirectPurchase(product, selected, quantity);
    if (result.error) { setPurchaseError(result.error); return; }
    setPurchaseError("");
    startTransition(() => beginBuyNow(result.item));
  };
  return <main className="product-page shell section-space"><div className="breadcrumbs"><Link to="/" navigate={navigate}>الرئيسية</Link><span>/</span><Link to={`/shop/${encodeURIComponent(product.categories[0]?.slug || "")}`} navigate={navigate}>{product.categories[0]?.name}</Link><span>/</span><span>{product.displayName}</span></div><div className="product-detail">
    <section className="product-gallery" aria-label="صور المنتج"><div className="main-product-image"><img src={image?.localOptimizedPath || image?.localOriginalPath} alt={product.name} /></div><div className="thumbnails">{galleryImages.map((entry, index) => <button key={entry.id || index} className={entry.id === image?.id ? "active" : ""} onClick={() => setActiveImageId(entry.id)} aria-label={`عرض الصورة ${index + 1}`} aria-pressed={entry.id === image?.id}><img src={entry.localOptimizedPath || entry.localOriginalPath} alt="" /></button>)}</div></section>
    <section className="product-info"><span className="product-kicker">{product.categories.map((category) => category.name).join(" · ")}</span><h1>{product.name}</h1><div className="sku-line">رمز المنتج: <b>{product.sku || "غير منشور"}</b></div><Price product={product} variant={matchedVariant} />
      {product.options.map((option) => <fieldset className="variant-group" key={option.id}><legend>{option.name} <b>{selected[option.name] || "اختر"}</b></legend><div className={option === colorOption && option.values.length > 1 ? "variant-values color-values" : "variant-values"}>{option.values.map((value) => { const enabled = valueAvailable(option.name, value.label); const isSelected = selected[option.name] === value.label; const thumb = option === colorOption && option.values.length > 1 ? thumbnailForColor(product, value.label) : null; return <button key={value.id} type="button" disabled={!enabled} className={`${isSelected ? "selected" : ""} ${option === colorOption && option.values.length > 1 ? "color-choice" : ""}`} onClick={() => selectValue(option.name, value.label)} aria-pressed={isSelected}>{option === colorOption && option.values.length > 1 && <span className="color-choice-image">{thumb ? <img src={thumb.localOptimizedPath || thumb.localOriginalPath} alt="" /> : <span aria-hidden="true">{value.label.slice(0, 1)}</span>}</span>}<span>{value.label}</span>{isSelected && <Check size={14} aria-hidden="true" />}</button>; })}</div></fieldset>)}
      <div className={`availability-line ${canBuy ? "available" : "unavailable"}`}><span />{canBuy ? `متوفر${matchedVariant?.stockQuantity != null ? ` — ${matchedVariant.stockQuantity} في المخزون` : ""}` : "هذه التوليفة غير متوفرة"}</div>
      <div className="purchase-controls"><div className="quantity-control"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="تقليل الكمية" disabled={quantity <= 1}><Minus size={16} /></button><span aria-live="polite">{quantity}</span><button onClick={() => setQuantity(Math.min(maximumQuantity, quantity + 1))} aria-label="زيادة الكمية" disabled={!canBuy || quantity >= maximumQuantity}><Plus size={16} /></button></div><span>الكمية</span></div>
      {purchaseError && <p className="purchase-error" role="alert">{purchaseError}</p>}
      <button className="primary-button buy-now-button" type="button" onClick={buyNow} aria-busy={isNavigating} disabled={isNavigating || product.availability !== "available" || product.variants.length === 0 || (matchedVariant && !variantCanBeBought(matchedVariant))}><Lightning size={21} weight="fill" /> {isNavigating ? "جارٍ الانتقال…" : "اشترِ الآن"}</button>
      <div className="purchase-secondary"><button className="add-button" type="button" disabled={!canBuy} onClick={() => addToCart(product, matchedVariant, quantity)}><ShoppingBag size={20} /> {canBuy ? "أضف إلى السلة" : "غير متوفر"}</button><button className={`detail-wish ${wishlist.includes(product.id) ? "active" : ""}`} onClick={() => toggleWishlist(product.id)} aria-label={wishlist.includes(product.id) ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}><Heart size={23} weight={wishlist.includes(product.id) ? "fill" : "regular"} /></button></div>
      <WhatsAppLink href={whatsAppProductHref} product />
      <div className="prototype-note"><ShieldCheck size={20} /><span><b>واجهة متجر تجريبية</b> — السلة ومسار الطلب يعملان محلياً، ولا يتم إرسال طلب حقيقي.</span></div>
      <div className="product-accordions"><details open><summary>الوصف ومعلومات المنتج <Plus size={17} /></summary><div>{product.shortDescription && <p>{product.shortDescription}</p>}{product.descriptionHtml ? <div className="product-rich-description" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} /> : product.description ? <p>{product.description}</p> : <p>لم ينشر المتجر وصفاً تفصيلياً لهذا المنتج.</p>}<dl><div><dt>العلامة</dt><dd>{product.brandName || product.brand?.name || "غير منشورة"}</dd></div><div><dt>الفئة</dt><dd>{product.categories.map((category) => category.name).join("، ")}</dd></div></dl></div></details><details><summary>التوصيل والدفع <Plus size={17} /></summary><div><p>تعرض صفحة المنتج الأصلية خيار الدفع عند الاستلام وتذكر التوصيل خلال 24 إلى 48 ساعة. راجع سياسات المتجر المنشورة قبل الاعتماد النهائي.</p></div></details><details><summary>الاستبدال <Plus size={17} /></summary><div><p>يخضع الاستبدال للشروط والفترة المنشورة في سياسة الاستبدال.</p><Link to="/pages/سياسة-الا-ستبدال" navigate={navigate} className="text-link">قراءة السياسة كاملة</Link></div></details></div>
    </section>
  </div><section className="related section-space"><div className="section-heading simple"><h2>قد يعجبك أيضاً</h2><Link to={`/shop/${encodeURIComponent(product.categories[0]?.slug || "")}`} navigate={navigate} className="text-link">عرض المجموعة <ArrowLeft size={17} /></Link></div><ProductGrid items={products.filter((entry) => entry.id !== product.id && entry.categories.some((category) => product.categories.some((own) => own.slug === category.slug))).slice(0, 4)} navigate={navigate} wishlist={wishlist} toggleWishlist={toggleWishlist} /></section><WhatsAppLink href={whatsAppProductHref} /></main>;
}

function WishlistPage({ wishlist, navigate, toggleWishlist, products }) {
  const items = wishlist.map((id) => getProduct(products, id)).filter(Boolean);
  return <main className="shell section-space utility-page"><div className="page-heading"><span>مختاراتك</span><h1>قائمة المفضلة</h1><p>{items.length ? `${items.length} منتجات محفوظة على هذا الجهاز` : "لم تحفظ أي منتج بعد."}</p></div><ProductGrid items={items} navigate={navigate} wishlist={wishlist} toggleWishlist={toggleWishlist} /></main>;
}

function cartDetails(cart, products) { return cart.map((item) => ({ ...item, product: getProduct(products, item.productId), variant: getProduct(products, item.productId)?.variants.find((variant) => variant.id === item.variantId) })).filter((item) => item.product); }

function OrderSummary({ subtotal, navigate, checkout = false, blocked = false }) {
  return <aside className="order-summary"><h2>ملخص الطلب</h2><div><span>المجموع الفرعي</span><strong>{formatPrice(subtotal)}</strong></div><div><span>التوصيل</span><b>غير محسوب في هذا النموذج</b></div><div className="summary-total"><span>مجموع المنتجات دون التوصيل</span><strong>{formatPrice(subtotal)}</strong></div><p className="prototype-label">{blocked ? "تحتوي السلة على اختيار غير متوفر. احذفه قبل المتابعة." : "نموذج أولي — لا يتم تحصيل أي مبلغ."}</p>{!checkout && <button className="primary-button" disabled={blocked} onClick={() => navigate("/checkout")}>متابعة إتمام الطلب <ArrowLeft size={18} /></button>}<Link to="/shop" navigate={navigate} className="continue-link"><ArrowRight size={16} /> متابعة التسوق</Link></aside>;
}

function CartPage({ cart, setCart, navigate, products }) {
  const items = cartDetails(cart, products);
  const subtotal = items.reduce((sum, item) => sum + (item.variant?.price.current ?? item.product.price.current ?? 0) * item.quantity, 0);
  const hasUnavailable = items.some(cartItemUnavailable);
  const change = (key, quantity) => setCart(cart.map((item) => {
    if (item.key !== key) return item;
    const product = getProduct(products, item.productId);
    const variant = product?.variants.find((entry) => entry.id === item.variantId);
    const maximum = Number.isFinite(variant?.stockQuantity) && variant.stockQuantity > 0 ? variant.stockQuantity : 99;
    return { ...item, quantity: Math.min(maximum, Math.max(1, quantity)) };
  }));
  const remove = (key) => setCart(cart.filter((item) => item.key !== key));
  return <main className="shell section-space cart-page"><div className="page-heading"><span>مراجعة الطلب</span><h1>سلة التسوق</h1><p>{items.length ? `${quantityFor(cart)} قطع في سلتك` : "سلتك فارغة حالياً."}</p></div>{!items.length ? <div className="empty-state"><ShoppingBag size={48} weight="light" /><h3>السلة بانتظار اختياراتك</h3><p>تصفح الكتالوج واختر اللون والمقاس المتاح.</p><Link to="/shop" navigate={navigate} className="primary-button">تصفح المنتجات</Link></div> : <div className="cart-layout"><section className="cart-items">{items.map((item) => { const image = item.product.images.find((entry) => entry.id === item.variant?.imageId) || item.product.images[0]; const maximum = Number.isFinite(item.variant?.stockQuantity) && item.variant.stockQuantity > 0 ? item.variant.stockQuantity : 99; return <article className="cart-item" key={item.key}><img src={image?.localOptimizedPath || image?.localOriginalPath} alt={item.product.name} /><div className="cart-item-copy"><Link to={productPath(item.product)} navigate={navigate}>{item.product.displayName}</Link><p>{item.variant?.selections.map((selection) => `${selection.option}: ${selection.value}`).join(" · ")}</p><Price product={item.product} variant={item.variant} compact /><div className="cart-item-actions"><div className="quantity-control small"><button onClick={() => change(item.key, item.quantity - 1)} aria-label="تقليل الكمية" disabled={item.quantity <= 1}><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => change(item.key, item.quantity + 1)} aria-label="زيادة الكمية" disabled={item.quantity >= maximum || item.variant?.availability === "unavailable"}><Plus size={14} /></button></div><button className="remove-button" onClick={() => remove(item.key)}><Trash size={17} /> حذف</button></div></div></article>; })}</section><OrderSummary subtotal={subtotal} navigate={navigate} blocked={hasUnavailable} /></div>}</main>;
}

function CheckoutPage({ cart, setCart, navigate, products, route, directPurchase, clearDirectPurchase }) {
  const directMode = new URLSearchParams(route.split("?")[1] || "").get("buy") === "1";
  const orderLines = checkoutLines(cart, directPurchase, directMode);
  const items = cartDetails(orderLines, products);
  const subtotal = items.reduce((sum, item) => sum + (item.variant?.price.current ?? item.product.price.current ?? 0) * item.quantity, 0);
  const hasUnavailable = items.some(cartItemUnavailable);
  const [complete, setComplete] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const submitOrder = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true); setSubmitError("");
    const form = new FormData(event.currentTarget);
    try {
      const payload = JSON.stringify({ customer: { name: form.get("name"), phone: form.get("phone"), city: form.get("city"), address: form.get("address") }, note: form.get("note") || "", items: orderLines.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })) });
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
      const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem("melyne-checkout-request") || "null"); }
      catch { sessionStorage.removeItem("melyne-checkout-request"); }
      const key = saved?.fingerprint === fingerprint ? saved.key : crypto.randomUUID();
      sessionStorage.setItem("melyne-checkout-request", JSON.stringify({ fingerprint, key }));
      const response = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: payload });
      const body = await response.json();
      if (!response.ok) {
        if (response.status < 500) sessionStorage.removeItem("melyne-checkout-request");
        throw new Error(body.error || "تعذر تسجيل الطلب");
      }
      sessionStorage.removeItem("melyne-checkout-request");
      setComplete(body); if (directMode) clearDirectPurchase(); else setCart([]);
    } catch (error) { setSubmitError(error.message); } finally { submittingRef.current = false; setSubmitting(false); }
  };
  if (!items.length && !complete) return <main className="shell section-space"><div className="empty-state"><ShoppingBag size={48} weight="light" /><h1>لا يمكن بدء الطلب</h1><p>{directMode ? "انتهى اختيار الشراء المباشر. عد إلى المنتج وحدد التوليفة من جديد." : "أضف منتجاً متاحاً إلى السلة أولاً."}</p><Link to="/shop" navigate={navigate} className="primary-button">العودة إلى المتجر</Link></div></main>;
  if (hasUnavailable && !complete) return <main className="shell section-space"><div className="empty-state"><Package size={48} weight="light" /><h1>اختيار غير متوفر</h1><p>لم تعد التوليفة أو الكمية المطلوبة متوفرة. اختر توليفة متاحة قبل متابعة الطلب.</p><Link to={directMode ? productPath(items[0].product) : "/cart"} navigate={navigate} className="primary-button">{directMode ? "العودة إلى المنتج" : "مراجعة السلة"}</Link></div></main>;
  if (complete) return <main className="shell section-space"><div className="checkout-success"><Check size={34} weight="bold" /><span>تم حفظ الطلب محلياً</span><h1>شكراً لك</h1><p>رقم الطلب التجريبي: <b dir="ltr">{complete.orderNumber}</b>. هذا الاختبار لا يرسل الطلب إلى متجر MELYNE الحقيقي، ولا يبدأ الدفع أو الشحن.</p><button className="primary-button" onClick={() => navigate("/")}>العودة إلى الرئيسية</button></div></main>;
  return <main className="shell checkout-page">
    <div className="prototype-banner"><ShieldCheck size={20} /><span><b>طلب محلي تجريبي بالدفع عند الاستلام</b> — يُحفظ الطلب في قاعدة البيانات المحلية فقط، ولا يُرسل إلى المتجر الحقيقي أو خدمة شحن أو دفع.</span></div>
    <div className="checkout-layout">
      <form id="checkout-order-form" className="checkout-form" onSubmit={submitOrder}>
        <div className="checkout-form-heading"><span>{directMode ? "شراء مباشر" : "إتمام الطلب"}</span><h1>تأكيد الطلب</h1></div>
        {submitError && <div className="policy-warning" role="alert">{submitError}</div>}
        <div className="form-grid">
          <label>الاسم الكامل <span aria-hidden="true">*</span><input required name="name" autoComplete="name" /></label>
          <label>رقم الهاتف <span aria-hidden="true">*</span><input required name="phone" type="tel" inputMode="tel" dir="ltr" autoComplete="tel" /></label>
          <label>المدينة <span aria-hidden="true">*</span><input required name="city" autoComplete="address-level2" /></label>
          <label>العنوان <span aria-hidden="true">*</span><input required name="address" autoComplete="street-address" /></label>
        </div>
        <details className="checkout-notes"><summary>ملاحظات الطلب <small>(اختياري)</small></summary><label><span className="visually-hidden">ملاحظات الطلب</span><textarea name="note" rows="2" /></label></details>
        <fieldset className="payment-options"><legend>طريقة الدفع</legend><label className="payment-card selected"><input type="radio" name="payment" defaultChecked /><HandCoins size={22} /><span><b>الدفع عند الاستلام</b><small>يؤكد المتجر الطلب قبل الشحن</small></span><Check size={18} /></label><label className="payment-card disabled"><input type="radio" name="payment" disabled /><CreditCard size={22} /><span><b>الدفع الإلكتروني</b><small>غير متاح حالياً</small></span></label></fieldset>
        <label className="terms-check"><input type="checkbox" required /><span>قرأت <Link to="/pages/سياسة-الا-ستبدال" navigate={navigate}>سياسة الاستبدال</Link>.</span></label>
      </form>
      <aside className="checkout-summary-panel" aria-label="تفاصيل الطلب"><div className="checkout-summary-heading"><h2>تفاصيل الطلب</h2><button className="summary-expand" type="button" aria-expanded={summaryExpanded} aria-controls="checkout-summary-items" onClick={() => setSummaryExpanded(!summaryExpanded)}>{summaryExpanded ? "إخفاء المنتجات" : `عرض المنتجات (${items.length})`} <CaretDown size={15} /></button></div><div id="checkout-summary-items" className={`checkout-summary-items${summaryExpanded ? " expanded" : ""}`}>{items.map((item) => { const image = item.product.images.find((entry) => entry.id === item.variant?.imageId) || item.product.images[0]; const unit = item.variant?.price.current ?? item.product.price.current ?? 0; return <div className="checkout-summary-item" key={item.key || `${item.productId}-${item.variantId}`}><img src={image?.localOptimizedPath || image?.localOriginalPath} alt="" /><div><strong>{item.product.displayName}</strong><small>{item.variant?.selections.map((selection) => `${selection.option}: ${selection.value}`).join(" · ") || "بدون خيارات"}</small><small>الكمية {item.quantity}</small></div><b>{formatPrice(unit * item.quantity)}</b></div>; })}</div><div className="checkout-summary-totals"><div><span>المجموع الفرعي</span><strong>{formatPrice(subtotal)}</strong></div><div><span>التوصيل</span><span>غير محسوب في هذا النموذج</span></div><div className="summary-total"><span>مجموع المنتجات دون التوصيل</span><strong>{formatPrice(subtotal)}</strong></div></div><p className="prototype-label">نموذج أولي — لا يتم تحصيل أي مبلغ.</p><button className="primary-button checkout-submit" type="submit" form="checkout-order-form" disabled={submitting}>{submitting ? "جارٍ التحقق…" : "تأكيد الطلب"}</button></aside>
    </div>
  </main>;
}

function PolicyPage({ policy, navigate }) {
  const lines = (policy?.bodyText || "المحتوى غير متوفر.").split(/\n+/).filter(Boolean);
  return <main className="policy-page shell section-space"><div className="breadcrumbs"><Link to="/" navigate={navigate}>الرئيسية</Link><span>/</span><span>{policy?.title}</span></div><article><span className="eyebrow">سياسة MELYNE المنشورة</span><h1>{policy?.title}</h1><p className="source-note">النص أدناه محفوظ من الصفحة العامة للمتجر بتاريخ {new Date(storeData.extractedAt).toLocaleDateString("ar-MA")}.</p><div className="policy-copy">{lines.map((line, index) => <p key={`${index}-${line.slice(0, 10)}`}>{line}</p>)}</div>{policy?.slug === "سياسة-الدفع-والا-من" && <div className="policy-warning"><ShieldCheck size={22} /><p>تنبيه للمراجعة: تتعارض فقرة الاسترداد هنا مع سياسة الاستبدال المنشورة التي تنص على عدم قبول إرجاع الأموال.</p></div>}</article></main>;
}

function NotFound({ navigate }) { return <main className="shell section-space"><div className="empty-state"><Package size={48} weight="light" /><h1>الصفحة غير موجودة</h1><p>قد يكون الرابط تغير أو لم يعد متاحاً.</p><Link to="/" navigate={navigate} className="primary-button">العودة إلى الرئيسية</Link></div></main>; }

function Footer({ navigate }) {
  const social = storeData.social || {};
  return <footer className="site-footer"><div className="footer-main shell"><section className="footer-brand"><img src={storeData.logo.localPath} alt="MELYNE" /><p>أزياء عصرية للنساء والرجال والأطفال من الكتالوج العام لمتجر MELYNE.</p><div className="social-links">{social.facebook && <a href={social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><FacebookLogo size={20} /></a>}{social.instagram && <a href={social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><InstagramLogo size={20} /></a>}{social.whatsapp && <a href={social.whatsapp} target="_blank" rel="noreferrer" aria-label="WhatsApp"><WhatsappLogo size={20} /></a>}{social.tiktok && <a href={social.tiktok} target="_blank" rel="noreferrer" aria-label="TikTok"><TiktokLogo size={20} /></a>}</div></section><section><h2>المجموعات</h2><Link to="/shop/kids" navigate={navigate}>ملابس الأطفال</Link><Link to="/shop/women" navigate={navigate}>ملابس نسائية</Link><Link to="/shop/ملابس-رجالية" navigate={navigate}>ملابس رجالية</Link></section><section><h2>المساعدة</h2>{storeData.policies.map((policy) => <Link key={policy.slug} to={`/pages/${encodeURIComponent(policy.slug)}`} navigate={navigate}>{policy.title}</Link>)}</section><section className="footer-contact"><h2>تواصل معنا</h2><a href={`mailto:${storeData.contact.email}`}><EnvelopeSimple size={18} />{storeData.contact.email}</a><a href={`tel:${storeData.contact.phone}`}><Phone size={18} />{storeData.contact.phone}</a><span><MapPin size={18} />المغرب</span></section></div><div className="footer-bottom shell"><span>© 2026 MELYNE — نموذج متجر محلي غير منشور.</span><span>الأسعار بالدرهم المغربي (MAD)</span></div></footer>;
}

function AppRouter({ route, navigate, ...props }) {
  const pathname = route.split("?")[0];
  if (pathname === "/") return <HomePage navigate={navigate} {...props} />;
  if (pathname === "/shop") return <CatalogPage key={route} navigate={navigate} {...props} />;
  if (pathname.startsWith("/shop/")) return <CatalogPage key={route} slug={decodeURIComponent(pathname.slice(6))} navigate={navigate} {...props} />;
  if (pathname.startsWith("/products/")) { const slug = decodeURIComponent(pathname.slice(10)); const product = props.products.find((entry) => entry.slug === slug); return product ? <ProductPage key={product.id} product={product} navigate={navigate} {...props} /> : <NotFound navigate={navigate} />; }
  if (pathname === "/wishlist") return <WishlistPage navigate={navigate} {...props} />;
  if (pathname === "/cart") return <CartPage navigate={navigate} {...props} />;
  if (pathname === "/checkout") return <CheckoutPage key={route} route={route} navigate={navigate} {...props} />;
  if (pathname.startsWith("/pages/")) { const slug = decodeURIComponent(pathname.slice(7)); const policy = storeData.policies.find((entry) => entry.slug === slug); return policy ? <PolicyPage policy={policy} navigate={navigate} /> : <NotFound navigate={navigate} />; }
  return <NotFound navigate={navigate} />;
}

export function App() {
  const [route, navigate] = useRoute();
  const [wishlist, setWishlist] = useStoredState("melyne-wishlist", []);
  const [cart, setCart] = useStoredState("melyne-cart", []);
  const [directPurchase, setDirectPurchase] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("melyne-direct-purchase")); } catch { return null; }
  });
  const [panel, setPanel] = useState(null);
  const [toast, setToast] = useState("");
  const [storefront, setStorefront] = useState({ products: [], featuredProducts: [], banners: [], categories: fallbackCategories });
  const [catalogState, setCatalogState] = useState("loading");
  const pathname = route.split("?")[0];
  const activeProduct = pathname.startsWith("/products/") ? storefront.products.find((entry) => entry.slug === decodeURIComponent(pathname.slice(10))) : null;
  const generalWhatsAppHref = whatsAppHref(storeData.whatsappSupportNumber, generalWhatsAppMessage);
  useEffect(() => {
    let active = true;
    let latestRequest = 0;
    const refresh = () => {
      const request = ++latestRequest;
      fetch("/api/public/storefront", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("Catalog API unavailable");
        const next = await response.json();
        if (active && request === latestRequest) { setStorefront({ ...next, categories: next.categories?.length ? next.categories : fallbackCategories }); setCatalogState("ready"); }
      }).catch(() => { if (active && request === latestRequest) setCatalogState("error"); });
    };
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { active = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, []);
  useEffect(() => {
    const product = pathname.startsWith("/products/") ? storefront.products.find((entry) => entry.slug === decodeURIComponent(pathname.slice(10))) : null;
    const policy = pathname.startsWith("/pages/") ? storeData.policies.find((entry) => entry.slug === decodeURIComponent(pathname.slice(7))) : null;
    const meta = product ? [`${product.seoTitle || product.displayName} | MELYNE`, product.metaDescription || product.shortDescription || product.description || `${product.displayName} — ${formatPrice(product.price.current)}.`] : policy ? [`${policy.title} | MELYNE`, policy.bodyText?.slice(0, 150)] : pageMeta[pathname] || pageMeta["/shop"];
    document.title = meta[0];
    let description = document.querySelector('meta[name="description"]');
    if (!description) { description = document.createElement("meta"); description.name = "description"; document.head.appendChild(description); }
    description.content = meta[1] || "MELYNE";
    document.documentElement.lang = "ar"; document.documentElement.dir = "rtl";
    document.querySelectorAll('script[data-product-schema]').forEach((node) => node.remove());
    if (product) {
      const schema = document.createElement("script"); schema.type = "application/ld+json"; schema.dataset.productSchema = "true";
      schema.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: product.name, sku: product.sku || undefined, image: product.images.map((image) => image.sourceUrl).filter(Boolean), description: product.shortDescription || product.description || undefined, brand: product.brandName || product.brand?.name ? { "@type": "Brand", name: product.brandName || product.brand.name } : undefined, offers: { "@type": "Offer", priceCurrency: "MAD", price: product.price.current, availability: productHasStock(product) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: product.canonicalUrl || `${window.location.origin}${productPath(product)}` } });
      document.head.appendChild(schema);
    }
  }, [pathname, storefront.products]);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(""), 2600); return () => clearTimeout(timer); }, [toast]);
  const toggleWishlist = (productId) => { const exists = wishlist.includes(productId); setWishlist(exists ? wishlist.filter((id) => id !== productId) : [...wishlist, productId]); setToast(exists ? "تمت الإزالة من المفضلة" : "تمت الإضافة إلى المفضلة"); };
  const addToCart = (product, variant, quantity = 1) => {
    if ((product.variants.length > 0 && !variant) || (variant && !variantCanBeBought(variant)) || product.availability !== "available") { setToast("هذه التوليفة غير متوفرة"); return; }
    const key = `${product.id}:${variant?.id || "default"}`; const existing = cart.find((item) => item.key === key);
    const maximum = Number.isFinite(variant?.stockQuantity) && variant.stockQuantity > 0 ? variant.stockQuantity : 99;
    const requested = Math.min(maximum, (existing?.quantity || 0) + quantity);
    setCart(existing ? cart.map((item) => item.key === key ? { ...item, quantity: requested } : item) : [...cart, { key, productId: product.id, variantId: variant?.id || null, quantity: Math.min(maximum, quantity) }]); setToast("تمت الإضافة إلى السلة");
  };
  const beginBuyNow = (item) => { setDirectPurchase(item); try { sessionStorage.setItem("melyne-direct-purchase", JSON.stringify(item)); } catch { /* in-memory checkout still works */ } navigate("/checkout?buy=1"); };
  const clearDirectPurchase = () => { setDirectPurchase(null); try { sessionStorage.removeItem("melyne-direct-purchase"); } catch { /* storage unavailable */ } };
  return <div className="app-shell"><a href="#main-content" className="skip-link">انتقل إلى المحتوى</a>{route.split("?")[0] === "/checkout" && catalogState === "ready" ? <CheckoutHeader navigate={navigate} directMode={new URLSearchParams(route.split("?")[1] || "").get("buy") === "1"} /> : <Header navigate={navigate} cart={cart} wishlist={wishlist} onMenu={() => setPanel("menu")} onSearch={() => setPanel("search")} />}<div id="main-content">{catalogState === "loading" ? <main className="shell section-space"><div className="empty-state"><Package size={44}/><h1>جارٍ تحميل المتجر…</h1></div></main> : catalogState === "error" ? <main className="shell section-space"><div className="empty-state"><Package size={44}/><h1>تعذر تحميل الكتالوج</h1><p>لم تتصل الواجهة بقاعدة بيانات MELYNE. حاول مرة أخرى بعد لحظات.</p><button className="primary-button" onClick={() => window.location.reload()}>إعادة المحاولة</button></div></main> : <AppRouter route={route} navigate={navigate} wishlist={wishlist} toggleWishlist={toggleWishlist} cart={cart} setCart={setCart} addToCart={addToCart} beginBuyNow={beginBuyNow} directPurchase={directPurchase} clearDirectPurchase={clearDirectPurchase} products={storefront.products} featuredProducts={storefront.featuredProducts} banners={storefront.banners} categories={storefront.categories} />}</div><Footer navigate={navigate} /><MobilePanel open={Boolean(panel)} type={panel} onClose={() => setPanel(null)} navigate={navigate} />{!activeProduct && <WhatsAppLink href={generalWhatsAppHref} />}{toast && <div className="toast" role="status"><Check size={18} weight="bold" />{toast}</div>}</div>;
}
