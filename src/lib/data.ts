import type { Category, Deal } from "./types";

export const categories: Category[] = [
  { id: "all", label: "הכל", icon: "tag" },
  { id: "food", label: "מזון ומשלוחים", icon: "food" },
  { id: "fashion", label: "אופנה", icon: "fashion" },
  { id: "tech", label: "טכנולוגיה", icon: "tech" },
  { id: "home", label: "בית ועיצוב", icon: "home" },
  { id: "travel", label: "נסיעות", icon: "travel" },
  { id: "baby", label: "תינוקות וילדים", icon: "baby" },
  { id: "sport", label: "ספורט", icon: "sport" },
];

export const deals: Deal[] = [
  {
    id: "1",
    title: "עד 40% הנחה על כל האתר",
    merchant: "Wolt",
    discountLabel: "40%",
    description: "משלוחים מהירים ממסעדות אהובות — ללא קוד, הנחה אוטומטית בעגלה.",
    imageUrl:
      "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&q=80",
    categoryId: "food",
    endsAt: "2026-05-10",
    isFeatured: true,
  },
  {
    id: "2",
    title: "קופון 15% על אלקטרוניקה",
    merchant: "KSP",
    discountLabel: "15%",
    description: "מחשבים, סמארטפונים ואביזרים — עד גמר המלאי.",
    imageUrl:
      "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&q=80",
    categoryId: "tech",
    endsAt: "2026-05-08",
    isFeatured: true,
  },
  {
    id: "3",
    title: "2 ב-1 על קולקציית אביב",
    merchant: "Fox",
    discountLabel: "2+1",
    description: "בגדי ילדים ומבוגרים — משלוח חינם מעל 199 ₪.",
    imageUrl:
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80",
    categoryId: "fashion",
    endsAt: "2026-05-15",
    isFeatured: true,
  },
  {
    id: "4",
    title: "הנחה עד 250 ₪ על ריהוט",
    merchant: "IKEA",
    discountLabel: "250 ₪",
    description: "מיטות, ארונות ואביזרי בית — לחברי מועדון בלבד.",
    imageUrl:
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80",
    categoryId: "home",
    endsAt: "2026-05-20",
    isFeatured: true,
  },
  {
    id: "5",
    title: "לילה במלון + ארוחת בוקר",
    merchant: "Booking.com",
    discountLabel: "25%",
    description: "מבצעי רגע אחרון בישראל ובחו״ל.",
    imageUrl:
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
    categoryId: "travel",
    endsAt: "2026-05-12",
  },
  {
    id: "6",
    title: "20% על ציוד ספורט",
    merchant: "Decathlon",
    discountLabel: "20%",
    description: "ריצה, כושר וחוץ — קוד בקופה.",
    imageUrl:
      "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800&q=80",
    categoryId: "sport",
    endsAt: "2026-05-18",
  },
  {
    id: "7",
    title: "מבצעי חיתולים ומזון לתינוקות",
    merchant: "Shilav",
    discountLabel: "עד 30%",
    description: "מותגים מובילים — איסוף עצמי או משלוח.",
    imageUrl:
      "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800&q=80",
    categoryId: "baby",
    endsAt: "2026-05-09",
  },
  {
    id: "8",
    title: "קפה ומאפים בחצי מחיר",
    merchant: "ארקפה",
    discountLabel: "50%",
    description: "בסניפים נבחרים — הצג קופון באפליקציה.",
    imageUrl:
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80",
    categoryId: "food",
    endsAt: "2026-05-05",
  },
];

export function getFeaturedDeals(): Deal[] {
  return deals.filter((d) => d.isFeatured);
}

export function formatDealEndDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
