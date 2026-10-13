export type Product = {
  id: string; name: string; price: number; category: 'machine' | 'bean'; image: string; description: string; why: string;
  descriptionAr?: string; whyAr?: string; detailDescription?: string; detailDescriptionAr?: string;
  origin?: string; originAr?: string; bagSize?: string;
};
export type Bundle = { id: string; name: string; regular: number; price: number; items: string[]; note: string; noteAr?: string };

export type CatalogItem = Product | Bundle;
