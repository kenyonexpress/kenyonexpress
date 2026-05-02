export type Deal = {
  id: string;
  title: string;
  merchant: string;
  discountLabel: string;
  description: string;
  imageUrl: string;
  categoryId: string;
  endsAt: string;
  isFeatured?: boolean;
};

export type Category = {
  id: string;
  label: string;
  icon: "tag" | "food" | "fashion" | "tech" | "home" | "travel" | "baby" | "sport";
};
