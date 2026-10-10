import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Link, useLocation, Router as WouterRouter } from 'wouter';
import { ArrowDown, ArrowRight, Check, ChevronDown, Menu, Moon, Plus, ShoppingBag, Sun, X } from 'lucide-react';
import xbloomPhoto from '@assets/image_1791649384537.png';

type Language = 'en' | 'ar';
type Product = { id: string; name: string; price: number; category: 'machine' | 'bean'; image: string; description: string; why: string; origin?: string };
type CartItem = { id: string; name: string; price: number; image: string; quantity: number; isBundle?: boolean };

const queryClient = new QueryClient();

const products: Product[] = [
  { id: 'xbloom', name: 'xBloom Studio', price: 199, category: 'machine', image: 'xbloom-photo', description: 'A complete pour-over system, tuned to your recipe.', why: 'It grinds, weighs, and pours following a programmed recipe, so every variable has a place.' },
  { id: 'fellow-aiden', name: 'Fellow Aiden Precision Coffee Maker', price: 129, category: 'machine', image: 'tall', description: 'Precision brewing, with the ease of a morning button.', why: 'It controls water temperature and timing for each brew stage, bringing repeatability to batch coffee.' },
  { id: 'moccamaster', name: 'Moccamaster 10-Cup Coffee Maker', price: 100, category: 'machine', image: 'machine', description: 'A considered classic for cups shared around the table.', why: 'A copper heating element maintains brew temperature for a steady, balanced extraction.' },
  { id: 'eureka-filtro', name: 'Eureka Filtro grinder', price: 89, category: 'machine', image: 'grinder', description: 'A dedicated filter grinder with a quietly capable motor.', why: 'Flat steel burrs produce even grounds across the range, helping your coffee taste clear and composed.' },
  { id: 'stagg-ekg', name: 'Fellow Stagg EKG Electric Kettle Pro', price: 59, category: 'machine', image: 'kettle', description: 'A precise pour, with temperature at your fingertips.', why: 'A PID controller maintains your set temperature; the balanced spout makes a measured pour feel natural.' },
  { id: 'hario-scale', name: 'Hario V60 Drip Scale and Timer', price: 19, category: 'machine', image: 'scale', description: 'Two useful measurements, neatly brought together.', why: 'It weighs your coffee and water while a built-in timer tracks each pour.' },
  { id: 'konga', name: 'Ethiopia Konga', price: 6, category: 'bean', image: 'bag', description: '250g · Roasted in Kuwait by Speak Coffee Roaster', why: 'An expressive Ethiopian coffee, roasted locally to make the most of its lively, layered character.', origin: '250g · Speak Coffee Roaster' },
  { id: 'webanchi', name: 'Ethiopia Webanchi', price: 6.5, category: 'bean', image: 'bag', description: '250g · Roasted in Kuwait by Speak Coffee Roaster', why: 'A carefully roasted Ethiopian coffee with a bright, fragrant cup and a long, sweet finish.', origin: '250g · Speak Coffee Roaster' },
  { id: 'caramel-candy', name: 'Blend Caramel Candy', price: 5, category: 'bean', image: 'bag', description: '250g · Roasted in Kuwait by Speak Coffee Roaster', why: 'A comforting everyday blend with a rounded sweetness that works beautifully across brew styles.', origin: '250g · Speak Coffee Roaster' },
  { id: 'brazil-samba', name: 'Brazil Samba', price: 3.5, category: 'bean', image: 'bag', description: '250g · Roasted in Kuwait by Speak Coffee Roaster', why: 'An easygoing Brazilian coffee roasted for a sweet, dependable cup, morning after morning.', origin: '250g · Speak Coffee Roaster' },
];

const bundles = [
  { id: 'bundle-morning', name: 'The Automatic Morning', regular: 211.5, price: 199, items: ['xBloom Studio', 'Ethiopia Konga', 'Ethiopia Webanchi'], note: 'A whole recipe, ready to wake up with you.' },
  { id: 'bundle-daily', name: 'The Daily Brewer', regular: 140, price: 132, items: ['Fellow Aiden Precision Coffee Maker', 'Blend Caramel Candy', 'Ethiopia Konga'], note: 'A reliable daily ritual, with room to explore.' },
  { id: 'bundle-precision', name: 'The Precision Set', regular: 81.5, price: 75, items: ['Fellow Stagg EKG Electric Kettle Pro', 'Hario V60 Drip Scale and Timer', 'Brazil Samba'], note: 'The essentials for a deliberate pour-over.' },
];

const copy = {
  en: {
    announcement: 'Free delivery on orders over 25 KWD · Kuwait',
    navMachines: 'Machines', navBeans: 'Beans', navBundles: 'Bundles', navContact: 'Contact', categories: 'Categories',
    heroTag: 'Good coffee is a set of decisions',
    heroLead: 'Engineer', heroEm: 'your cup.',
    heroText: 'A thoughtful edit of coffee tools and locally roasted beans for people who like knowing how their coffee gets made.',
    shopNow: 'Shop Now', detailNote: 'Tools for better mornings, chosen with care',
    ticker1: 'Measure what matters', ticker2: 'Locally roasted in Kuwait', ticker3: 'Brew with intention', ticker4: 'A better cup, by design',
    productsTag: 'The working collection', productsTitle: 'Find your flow.',
    productsIntro: 'Good tools make the process clearer. Start with the part of your brew you want to understand better.',
    all: 'Everything', machines: 'Machines', beans: 'Beans', how: 'How it works', details: 'Details', add: 'Add to cart',
    bundlesTag: 'Made to work together', bundlesTitle: 'A good place to begin.',
    bundlesIntro: 'Three combinations, considered from the first grind to the final pour. A little less to decide, a lot more to enjoy.',
    bundleNote: 'Included in this set', save: 'Save', addBundle: 'Add bundle to cart',
    originTag: 'Close to home', originTitle: 'Roasted here. Brewed here.',
    originText: 'The coffee in our shop comes from Speak Coffee Roaster, roasting right here in Kuwait. We choose coffees that invite curiosity and tools that help you get to know them, one cup at a time.',
    originStat1: 'Coffee, roasted locally', originStat2: 'A cup at a time', originStat3: 'A considered collection',
    contactTitle: 'A question about your next cup?', contactText: 'We would love to help you find the right setup.', contactButton: 'Get in touch',
    footerText: 'Coffee equipment and beans for the curious home brewer. Kuwait, made for your counter.',
    shop: 'Shop', sayHello: 'Say hello', follow: 'Follow along', email: 'hello@brewlogic.com',
    rights: '© 2025 Brew Logic · Kuwait', crafted: 'Engineer your cup',
    cart: 'Your cart', emptyTitle: 'Nothing brewing yet.', emptyText: 'Your next good cup starts with a tool or a bag of beans.', startShopping: 'Explore the collection',
    subtotal: 'Total', checkout: 'Continue to checkout', checkoutNote: 'Checkout is a demo — no payment will be taken.',
    remove: 'Remove', added: 'Added to your cart', bundleAdded: 'Bundle added to your cart',
    close: 'Close', quantity: 'Quantity', productDetails: 'Product details', roasted: 'Roasted in Kuwait by Speak Coffee Roaster',
    themeLight: 'Switch to light theme', themeDark: 'Switch to dark theme', language: 'العربية', menu: 'Open menu',
    checkoutSuccess: 'Your selection is ready. Checkout is not enabled in this demo.',
    categoryMachines: 'Coffee machines & tools', categoryBeans: 'Locally roasted coffee',
    categoryMachineCopy: 'Thoughtful equipment that lets you get closer to the cup you want.', categoryBeansCopy: 'Freshly roasted in Kuwait by Speak Coffee Roaster. Find a coffee worth slowing down for.',
    noProducts: 'Nothing in this collection yet.',
    equipment: 'Brew equipment', localRoast: '250g · Kuwait roasted', each: 'Each', bundle: 'Bundle', brewStage: 'CALIBRATE · POUR · REPEAT', figure: 'FIG. 01 / POUR-OVER SYSTEM',
  },
  ar: {
    announcement: 'توصيل مجاني للطلبات فوق ٢٥ د.ك · الكويت',
    navMachines: 'الأجهزة', navBeans: 'البن', navBundles: 'المجموعات', navContact: 'تواصل معنا', categories: 'التصنيفات',
    heroTag: 'القهوة الجيدة تبدأ بقرارات مدروسة',
    heroLead: 'أتقن', heroEm: 'قهوتك.',
    heroText: 'اختيارات مدروسة من أدوات القهوة وحبوب محمصة محلياً، لكل من يهتم بكيفية تحضير فنجانه.',
    shopNow: 'تسوّق الآن', detailNote: 'أدوات لصباح أفضل، اخترناها بعناية',
    ticker1: 'قِس ما يهم', ticker2: 'تحميص محلي في الكويت', ticker3: 'حضّر باهتمام', ticker4: 'فنجان أفضل، بتصميم مدروس',
    productsTag: 'مجموعة الأدوات', productsTitle: 'اكتشف طريقتك.',
    productsIntro: 'الأدوات الجيدة تجعل التحضير أوضح. ابدأ بالجزء الذي ترغب في فهمه أكثر.',
    all: 'الكل', machines: 'الأجهزة', beans: 'البن', how: 'كيف تعمل', details: 'التفاصيل', add: 'أضف إلى السلة',
    bundlesTag: 'اختيارات تكمل بعضها', bundlesTitle: 'بداية موفقة.',
    bundlesIntro: 'ثلاث مجموعات مدروسة من أول طحن إلى آخر صبّة. خيارات أقل، ومتعة أكثر.',
    bundleNote: 'تتضمن هذه المجموعة', save: 'وفّر', addBundle: 'أضف المجموعة إلى السلة',
    originTag: 'من هنا', originTitle: 'تحميص محلي. وفنجانك أيضاً.',
    originText: 'القهوة في متجرنا من Speak Coffee Roaster، محمصة هنا في الكويت. نختار حبوباً تثير الفضول وأدوات تساعدك على اكتشافها، فنجاناً بعد فنجان.',
    originStat1: 'قهوة محمصة محلياً', originStat2: 'فنجاناً في كل مرة', originStat3: 'مجموعة مختارة بعناية',
    contactTitle: 'لديك سؤال عن فنجانك القادم؟', contactText: 'يسعدنا مساعدتك في اختيار الأدوات المناسبة.', contactButton: 'تواصل معنا',
    footerText: 'أدوات قهوة وحبوب لعشاق التحضير في المنزل. من الكويت، لركن قهوتك.',
    shop: 'تسوّق', sayHello: 'تواصل معنا', follow: 'تابعنا', email: 'hello@brewlogic.com',
    rights: '© ٢٠٢٥ Brew Logic · الكويت', crafted: 'أتقن قهوتك',
    cart: 'سلتك', emptyTitle: 'لا شيء في السلة بعد.', emptyText: 'فنجانك القادم يبدأ بأداة أو كيس من البن.', startShopping: 'اكتشف المجموعة',
    subtotal: 'الإجمالي', checkout: 'متابعة إلى إتمام الطلب', checkoutNote: 'هذه تجربة فقط — لن يتم تحصيل أي مبلغ.',
    remove: 'إزالة', added: 'أُضيف إلى سلتك', bundleAdded: 'أُضيفت المجموعة إلى سلتك',
    close: 'إغلاق', quantity: 'الكمية', productDetails: 'تفاصيل المنتج', roasted: 'تحميص Speak Coffee Roaster في الكويت',
    themeLight: 'التبديل إلى المظهر الفاتح', themeDark: 'التبديل إلى المظهر الداكن', language: 'English', menu: 'فتح القائمة',
    checkoutSuccess: 'اختياراتك جاهزة. إتمام الطلب غير متاح في هذه التجربة.',
    categoryMachines: 'أجهزة وأدوات القهوة', categoryBeans: 'قهوة محمصة محلياً',
    categoryMachineCopy: 'أدوات مدروسة تقرّبك من الفنجان الذي تريده.', categoryBeansCopy: 'محمصة في الكويت بواسطة Speak Coffee Roaster. اكتشف قهوة تستحق التمهل.',
    noProducts: 'لا توجد منتجات في هذه المجموعة حالياً.',
    equipment: 'أدوات التحضير', localRoast: '٢٥٠ غرام · تحميص محلي', each: 'للقطعة', bundle: 'مجموعة', brewStage: 'اضبط · اسكب · كرر', figure: 'الشكل ٠١ / تحضير بالتقطير',
  },
};

const arabicProductCopy: Record<string, { description: string; why: string }> = {
  xbloom: { description: 'نظام تقطير متكامل، مضبوط على وصفتك.', why: 'يطحن ويزن ويصب وفق وصفة مبرمجة، لتكون لكل متغيرات التحضير قيمة محددة.' },
  'fellow-aiden': { description: 'تحضير دقيق، بسهولة ضغطة صباحية.', why: 'يتحكم بدرجة حرارة الماء وتوقيت كل مرحلة، ليمنحك قهوة متوازنة كل مرة.' },
  moccamaster: { description: 'كلاسيكية مدروسة لفناجين تُشارك حول الطاولة.', why: 'يحافظ عنصر التسخين النحاسي على درجة حرارة التحضير لقهوة متوازنة.' },
  'eureka-filtro': { description: 'مطحنة مخصصة للقهوة المقطرة بمحرك هادئ وفعّال.', why: 'تنتج الشفرات الفولاذية المسطحة حبوباً متجانسة تساعد على استخلاص واضح ومتوازن.' },
  'stagg-ekg': { description: 'صب دقيق، ودرجة حرارة بين يديك.', why: 'يحافظ متحكم PID على درجة الحرارة المحددة، وفوهة الصب المتوازنة تجعل التحكم طبيعياً.' },
  'hario-scale': { description: 'قياسان مفيدان، في أداة واحدة.', why: 'يزن القهوة والماء بينما يتابع المؤقت المدمج مدة كل صبّة.' },
  konga: { description: '٢٥٠ غرام · تحميص Speak Coffee Roaster في الكويت', why: 'قهوة إثيوبية معبّرة، محمصة محلياً لإبراز نكهتها الحيوية ومتعددة الطبقات.' },
  webanchi: { description: '٢٥٠ غرام · تحميص Speak Coffee Roaster في الكويت', why: 'قهوة إثيوبية محمصة بعناية، بفنجان عطري مشرق ونهاية حلوة طويلة.' },
  'caramel-candy': { description: '٢٥٠ غرام · تحميص Speak Coffee Roaster في الكويت', why: 'خلطة يومية مريحة بحلاوة متوازنة تناسب طرق التحضير المختلفة.' },
  'brazil-samba': { description: '٢٥٠ غرام · تحميص Speak Coffee Roaster في الكويت', why: 'قهوة برازيلية سلسة، محمصة لفنجان حلو وموثوق كل صباح.' },
};

function money(price: number) {
  return `${Number.isInteger(price) ? price.toFixed(0) : price.toFixed(1)} KWD`;
}

function Logo() {
  return <Link href="/" className="brand" aria-label="Brew Logic home" data-testid="link-home">
    <svg className="brand-mark" viewBox="0 0 38 44" fill="none" aria-hidden="true">
      <path d="M7 5h24l-2.3 4H9.3L7 5Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="m9 10 4 15c.5 2 2.1 3.3 4 3.3h4c1.9 0 3.5-1.3 4-3.3l4-15" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M16 28.5v4.2m6-4.2v4.2M11 36h16M19 32.7v3.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M13 18h12" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2"/>
    </svg><span>Brew Logic</span>
  </Link>;
}

function ProductIllustration({ product, compact = false }: { product: Product | CartItem; compact?: boolean }) {
  const image = product.image || 'machine';
  const hasPhoto = image === 'xbloom-photo';
  return <div className={`product-visual${compact ? ' compact' : ''}${hasPhoto ? ' has-photo' : ''}`} aria-label={`${product.name} ${hasPhoto ? 'product photo' : 'illustrative product graphic'}`} role="img">
    <span className="visual-tag">{'category' in product && product.category === 'bean' || image === 'bag' ? 'Speak · Kuwait' : 'Brew / 01'}</span>
    {hasPhoto ? <img className="product-photo" src={xbloomPhoto} alt="" aria-hidden="true" /> : <div className={`device ${image}`} aria-hidden="true" />}
  </div>;
}

function ProductCard({ product, t, language, onAdd, onDetails }: { product: Product; t: typeof copy.en; language: Language; onAdd: (product: Product) => void; onDetails: (product: Product) => void }) {
  const localized = language === 'ar' ? arabicProductCopy[product.id] : undefined;
  return <article className="product-card" data-testid={`card-product-${product.id}`}>
    <ProductIllustration product={product} />
    <div className="product-info">
      <div className="product-kicker">{product.category === 'bean' ? t.localRoast : t.equipment}</div>
      <div className="product-title-line"><h3 className="product-title">{product.name}</h3><span className="product-price" data-testid={`text-price-${product.id}`}>{money(product.price)}</span></div>
      <p className="product-desc">{localized?.description || product.description}</p>
      <div className="card-actions">
        <button className="text-action" onClick={() => onDetails(product)} data-testid={`button-details-${product.id}`}>{t.details}</button>
        <button className="add-button" onClick={() => onAdd(product)} data-testid={`button-add-${product.id}`}>{t.add}</button>
      </div>
    </div>
  </article>;
}

function Header({ t, language, setLanguage, theme, toggleTheme, cartCount, openCart }: {
  t: typeof copy.en; language: Language; setLanguage: (l: Language) => void; theme: 'light' | 'dark'; toggleTheme: () => void; cartCount: number; openCart: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [location] = useLocation();
  useEffect(() => { setMenuOpen(false); setCategoriesOpen(false); }, [location]);
  return <>
    <div className="top-strip">{t.announcement}</div>
    <header className="nav-shell">
      <div className="container-wide nav-inner">
        <Logo />
        <nav className="nav-links" aria-label="Main navigation">
          <div className="nav-drop">
            <button onClick={() => setCategoriesOpen(!categoriesOpen)} aria-expanded={categoriesOpen} data-testid="button-categories">{t.categories} <ChevronDown size={13}/></button>
            {categoriesOpen && <div className="drop-panel">
              <Link href="/machines" data-testid="link-machines-dropdown">{t.navMachines}</Link>
              <Link href="/beans" data-testid="link-beans-dropdown">{t.navBeans}</Link>
            </div>}
          </div>
          <Link href="/#bundles" data-testid="link-bundles">{t.navBundles}</Link>
          <Link href="/#contact" data-testid="link-contact">{t.navContact}</Link>
        </nav>
        <div className="nav-actions">
          <button className="icon-button" onClick={toggleTheme} aria-label={theme === 'light' ? t.themeDark : t.themeLight} data-testid="button-theme">
            {theme === 'light' ? <Moon size={16}/> : <Sun size={16}/>}
          </button>
          <button className="icon-button" onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} aria-label={`Language: ${language === 'en' ? 'Arabic' : 'English'}`} data-testid="button-language"><span style={{fontSize:10,fontWeight:600}}>{language === 'en' ? 'ع' : 'EN'}</span></button>
          <button className="icon-button" onClick={openCart} aria-label={t.cart} data-testid="button-cart"><ShoppingBag size={16}/>{cartCount > 0 && <span key={cartCount} className="cart-count" data-testid="text-cart-count">{cartCount}</span>}</button>
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label={t.menu} aria-expanded={menuOpen} data-testid="button-mobile-menu">{menuOpen ? <X size={17}/> : <Menu size={17}/>}</button>
        </div>
      </div>
      {menuOpen && <nav className="mobile-nav" aria-label="Mobile navigation">
        <button onClick={() => setCategoriesOpen(!categoriesOpen)} data-testid="button-mobile-categories">{t.categories} <ChevronDown size={13}/></button>
        {categoriesOpen && <><Link href="/machines" data-testid="link-mobile-machines">{t.navMachines}</Link><Link href="/beans" data-testid="link-mobile-beans">{t.navBeans}</Link></>}
        <Link href="/#bundles" data-testid="link-mobile-bundles">{t.navBundles}</Link>
        <Link href="/#contact" data-testid="link-mobile-contact">{t.navContact}</Link>
      </nav>}
    </header>
  </>;
}

function Footer({ t }: { t: typeof copy.en }) {
  return <>
    <section className="contact-band" id="contact">
      <div className="container-wide contact-inner"><div><h2>{t.contactTitle}</h2><p>{t.contactText}</p></div>
        <a className="primary-button" href="mailto:hello@brewlogic.com" data-testid="link-contact-email">{t.contactButton}<ArrowRight size={15}/></a>
      </div>
    </section>
    <footer className="footer">
      <div className="container-wide">
        <div className="footer-top">
          <div><Logo/><p className="footer-note">{t.footerText}</p></div>
          <div className="footer-links">
            <div className="footer-col"><strong>{t.shop}</strong><Link href="/machines" data-testid="footer-link-machines">{t.navMachines}</Link><Link href="/beans" data-testid="footer-link-beans">{t.navBeans}</Link><Link href="/#bundles" data-testid="footer-link-bundles">{t.navBundles}</Link></div>
            <div className="footer-col"><strong>{t.sayHello}</strong><a href="mailto:hello@brewlogic.com" data-testid="footer-link-email">{t.email}</a><a href="https://wa.me/96598858879" target="_blank" rel="noreferrer" data-testid="footer-link-whatsapp">WhatsApp</a></div>
            <div className="footer-col"><strong>{t.follow}</strong><a href="https://www.instagram.com/" target="_blank" rel="noreferrer" data-testid="footer-link-instagram">Instagram</a><span>Kuwait City, Kuwait</span></div>
          </div>
        </div>
        <div className="footer-bottom"><span>{t.rights}</span><span>{t.crafted}</span></div>
      </div>
    </footer>
  </>;
}

function Hero({ t }: { t: typeof copy.en }) {
  return <section className="container-wide hero">
    <div className="hero-copy">
      <div className="eyebrow">{t.heroTag}</div>
      <h1>{t.heroLead}<br/><em>{t.heroEm}</em></h1>
      <p className="hero-text">{t.heroText}</p>
      <a href="#products" className="primary-button" data-testid="link-shop-now">{t.shopNow}<ArrowDown size={15}/></a>
      <div className="hero-note"><span><Check size={13}/></span>{t.detailNote}</div>
    </div>
    <div className="hero-art" aria-label="Illustration of a pour-over coffee brewing stand" role="img">
      <div className="hero-disc"/>
      <div className="brew-scene"><div className="brew-stand"/><div className="brew-column"/><div className="brew-arm"/><div className="brew-drop"/><div className="brew-cup"/><div className="brew-base"/></div>
      <span className="brew-label">{t.brewStage}</span><span className="hero-index">{t.figure}</span>
    </div>
  </section>;
}

function Ticker({ t }: { t: typeof copy.en }) {
  return <div className="ticker"><div className="ticker-track">{[0, 1].map(n => <span key={n}>
    <span>{t.ticker1}</span><span>{t.ticker2}</span><span>{t.ticker3}</span><span>{t.ticker4}</span>
  </span>)}</div></div>;
}

function BundleSection({ t, language, onAdd }: { t: typeof copy.en; language: Language; onAdd: (bundle: typeof bundles[number]) => void }) {
  return <section className="bundles-section" id="bundles"><div className="container-wide">
    <div className="section-head"><div><div className="eyebrow">{t.bundlesTag}</div><h2>{t.bundlesTitle}</h2></div><p className="section-intro">{t.bundlesIntro}</p></div>
    <div className="bundle-grid">{bundles.map((bundle, index) => <article className="bundle-card" key={bundle.id} data-testid={`card-${bundle.id}`}>
      <span className="bundle-num">BL / SET 0{index + 1}</span><h3>{bundle.name}</h3><p>{language === 'ar' ? ['طقس صباحي متكامل، جاهز لتبدأ يومك.', 'تحضير يومي موثوق، مع مساحة للاكتشاف.', 'أساسيات التقطير لصبّة مدروسة.'][index] : bundle.note}</p>
      <ul className="bundle-items" aria-label={t.bundleNote}>{bundle.items.map(item => <li key={item}>{item}</li>)}</ul>
      <div className="bundle-bottom"><div className="bundle-price"><small>{money(bundle.regular)}</small><strong>{money(bundle.price)}</strong><span>{t.save} {money(bundle.regular - bundle.price)}</span></div>
        <button className="add-button" onClick={() => onAdd(bundle)} data-testid={`button-add-${bundle.id}`}>{t.addBundle}</button></div>
    </article>)}</div>
  </div></section>;
}

function OriginSection({ t }: { t: typeof copy.en }) {
  return <section className="container-wide origin-section">
    <div className="origin-art"><strong>LOCAL<br/>GROUND</strong><small>Speak Coffee Roaster · Kuwait</small></div>
    <div className="origin-copy"><div className="eyebrow">{t.originTag}</div><h2>{t.originTitle}</h2><p>{t.originText}</p>
      <div className="origin-stat"><div><strong>250g</strong>{t.originStat1}</div><div><strong>01</strong>{t.originStat2}</div><div><strong>∞</strong>{t.originStat3}</div></div>
    </div>
  </section>;
}

function CartDrawer({ open, close, items, t, onQuantity, onRemove, onCheckout }: {
  open: boolean; close: () => void; items: CartItem[]; t: typeof copy.en; onQuantity: (id: string, delta: number) => void; onRemove: (id: string) => void; onCheckout: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return <>
    <div className={`drawer-backdrop${open ? ' open' : ''}`} onClick={close} aria-hidden={!open}/>
    <aside className={`cart-drawer${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label={t.cart}>
      <div className="drawer-head"><h2>{t.cart} <span style={{fontSize:14,opacity:.55}}>({items.reduce((n, x) => n + x.quantity, 0)})</span></h2><button className="icon-button" onClick={close} aria-label={t.close} data-testid="button-close-cart"><X size={17}/></button></div>
      {items.length === 0 ? <div className="empty-cart"><div><ShoppingBag size={26} strokeWidth={1.2}/><h3>{t.emptyTitle}</h3><p>{t.emptyText}</p><button className="primary-button" onClick={close} data-testid="button-empty-shopping">{t.startShopping}<ArrowRight size={14}/></button></div></div> : <>
        <div className="cart-items">{items.map(item => <article className="cart-row" key={item.id} data-testid={`row-cart-${item.id}`}>
          <div className="cart-thumb"><div className={`device ${item.image}`}/></div>
          <div><h3>{item.name}</h3><small>{money(item.price)} · {item.isBundle ? t.bundle : t.each}</small><div className="quantity" aria-label={t.quantity}>
            <button onClick={() => onQuantity(item.id, -1)} aria-label={`Decrease ${item.name} quantity`} data-testid={`button-decrease-${item.id}`}>−</button><span data-testid={`text-quantity-${item.id}`}>{item.quantity}</span><button onClick={() => onQuantity(item.id, 1)} aria-label={`Increase ${item.name} quantity`} data-testid={`button-increase-${item.id}`}>+</button>
          </div></div><button className="remove-button" onClick={() => onRemove(item.id)} data-testid={`button-remove-${item.id}`}>{t.remove}</button>
        </article>)}</div>
        <div className="cart-summary"><div className="total-line"><span>{t.subtotal}</span><span data-testid="text-cart-total">{money(total)}</span></div><button className="primary-button checkout" onClick={onCheckout} data-testid="button-checkout">{t.checkout}<ArrowRight size={15}/></button><p className="checkout-note">{t.checkoutNote}</p></div>
      </>}
    </aside>
  </>;
}

function ProductModal({ product, t, language, close, onAdd }: { product: Product | null; t: typeof copy.en; language: Language; close: () => void; onAdd: (product: Product) => void }) {
  useEffect(() => {
    if (!product) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, close]);
  if (!product) return null;
  return <div className="modal-backdrop open" onClick={close} role="presentation">
    <section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title" onClick={event => event.stopPropagation()}>
      <button className="icon-button modal-close" onClick={close} aria-label={t.close} data-testid="button-close-details"><X size={16}/></button>
      <div className="eyebrow">{t.productDetails}</div><ProductIllustration product={product}/>
      <h2 id="product-modal-title">{product.name}</h2><p>{language === 'ar' ? arabicProductCopy[product.id]?.why : product.why}</p>
      {product.category === 'bean' && <p>{t.roasted}</p>}
      <div className="modal-meta"><span>{product.category === 'bean' ? t.localRoast : t.how}</span><strong>{money(product.price)}</strong></div>
      <button className="primary-button" onClick={() => { onAdd(product); close(); }} data-testid={`button-modal-add-${product.id}`}>{t.add}<Plus size={15}/></button>
    </section>
  </div>;
}

function Storefront() {
  const [location] = useLocation();
  const [language, setLanguageState] = useState<Language>(() => (localStorage.getItem('brew-language') as Language) || 'en');
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => (localStorage.getItem('brew-theme') as 'light' | 'dark') || 'light');
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('brew-cart') || '[]') as CartItem[]; } catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'machine' | 'bean'>('all');
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [toast, setToast] = useState('');
  const t = copy[language];
  const routeKind = location.startsWith('/machines') ? 'machine' : location.startsWith('/beans') ? 'bean' : 'all';
  const filteredProducts = useMemo(() => products.filter(product => routeKind === 'all' ? activeTab === 'all' || product.category === activeTab : product.category === routeKind), [routeKind, activeTab]);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    localStorage.setItem('brew-cart', JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    localStorage.setItem('brew-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('brew-language', language);
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const addItem = (item: Product | typeof bundles[number]) => {
    const isBundle = 'items' in item;
    const cartItem: CartItem = isBundle
      ? { id: item.id, name: item.name, price: item.price, image: 'machine', quantity: 1, isBundle: true }
      : { id: item.id, name: item.name, price: item.price, image: item.image, quantity: 1 };
    setCart(old => {
      const exists = old.find(entry => entry.id === cartItem.id);
      return exists ? old.map(entry => entry.id === cartItem.id ? { ...entry, quantity: entry.quantity + 1 } : entry) : [...old, cartItem];
    });
    setToast(isBundle ? t.bundleAdded : t.added);
  };
  const adjustQuantity = (id: string, delta: number) => setCart(old => old.flatMap(item => item.id === id ? (item.quantity + delta <= 0 ? [] : [{ ...item, quantity: item.quantity + delta }]) : [item]));
  const removeItem = (id: string) => setCart(old => old.filter(item => item.id !== id));
  return <div className="page-shell" data-testid="storefront">
    <Header t={t} language={language} setLanguage={setLanguageState} theme={theme} toggleTheme={() => setThemeState(theme === 'light' ? 'dark' : 'light')} cartCount={cartCount} openCart={() => setCartOpen(true)}/>
    {routeKind === 'all' && <><Hero t={t}/><Ticker t={t}/></>}
    <main className="container-wide section" id="products">
      {routeKind !== 'all' && <div className="section-head"><div><div className="eyebrow">{routeKind === 'machine' ? t.categoryMachines : t.categoryBeans}</div><h2>{routeKind === 'machine' ? t.navMachines : t.navBeans}</h2></div><p className="section-intro">{routeKind === 'machine' ? t.categoryMachineCopy : t.categoryBeansCopy}</p></div>}
      {routeKind === 'all' && <div className="section-head"><div><div className="eyebrow">{t.productsTag}</div><h2>{t.productsTitle}</h2></div><p className="section-intro">{t.productsIntro}</p></div>}
      {routeKind === 'all' && <div className="tabs" role="tablist" aria-label={t.productsTitle}>
        {(['all', 'machine', 'bean'] as const).map(tab => <button key={tab} role="tab" aria-selected={activeTab === tab} className={`tab${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)} data-testid={`tab-${tab}`}>{tab === 'all' ? t.all : tab === 'machine' ? t.machines : t.beans}</button>)}
      </div>}
      {filteredProducts.length ? <div className="product-grid">{filteredProducts.map(product => <ProductCard key={product.id} product={product} t={t} language={language} onAdd={addItem} onDetails={setModalProduct}/>)}</div> : <p>{t.noProducts}</p>}
    </main>
    {routeKind === 'all' && <><BundleSection t={t} language={language} onAdd={addItem}/><OriginSection t={t}/></>}
    <Footer t={t}/>
    <a className="whatsapp" href="https://wa.me/96598858879" target="_blank" rel="noreferrer" aria-label="Contact Brew Logic on WhatsApp" data-testid="link-floating-whatsapp"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.2 11.7a8.2 8.2 0 0 1-12.1 7.2L3 20l1.2-4.8A8.2 8.2 0 1 1 20.2 11.7Z" stroke="currentColor" strokeWidth="1.6"/><path d="M8.2 8.1c.3-.5.5-.5.8-.5h.5c.2 0 .4.1.5.5l.7 1.7c.1.3 0 .5-.2.7l-.5.6c-.2.2-.2.4-.1.6.4.8 1.3 1.6 2.2 2 .2.1.4.1.6-.1l.7-.8c.2-.2.4-.2.7-.1l1.6.8c.3.1.4.3.4.5 0 .3-.2 1.2-.8 1.5-.6.4-1.3.5-2.1.3-.8-.2-1.9-.7-3.1-1.8-1.2-1.1-2-2.4-2.2-3.3-.2-.9 0-1.6.3-2.1Z" fill="currentColor"/></svg></a>
    <CartDrawer open={cartOpen} close={() => setCartOpen(false)} items={cart} t={t} onQuantity={adjustQuantity} onRemove={removeItem} onCheckout={() => setToast(t.checkoutSuccess)}/>
    <ProductModal product={modalProduct} t={t} language={language} close={() => setModalProduct(null)} onAdd={addItem}/>
    <div className={`toast-message${toast ? ' show' : ''}`} role="status" aria-live="polite" data-testid="status-toast">{toast}</div>
  </div>;
}

function Router() {
  return <RoutedErrorBoundary>
    <Switch>
      <Route path="/" component={Storefront}/>
      <Route path="/machines" component={Storefront}/>
      <Route path="/beans" component={Storefront}/>
      <Route component={NotFound}/>
    </Switch>
  </RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router/>
      </WouterRouter>
      <Toaster/>
    </TooltipProvider>
  </QueryClientProvider>;
}

export default App;
