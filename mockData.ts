export type MockProduct = {
  id: string;
  name: string;
  platform: string;
  imageUrl: string;
  url: string;
};

export const mockProducts: MockProduct[] = [
  {
    id: "p1",
    name: "恐龍夾夾槍玩具（藍色）",
    platform: "蝦皮購物",
    imageUrl:
      "https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=900&q=80",
    url: "https://example.com/product/p1"
  },
  {
    id: "p2",
    name: "兒童抓取夾玩具發射器",
    platform: "momo",
    imageUrl:
      "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=900&q=80",
    url: "https://example.com/product/p2"
  },
  {
    id: "p3",
    name: "夜市熱門機械夾手槍",
    platform: "PChome",
    imageUrl:
      "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=900&q=80",
    url: "https://example.com/product/p3"
  },
  {
    id: "p4",
    name: "藍色夾娃娃手持玩具",
    platform: "淘寶",
    imageUrl:
      "https://images.unsplash.com/photo-1558877385-81a1c7a6ce59?auto=format&fit=crop&w=900&q=80",
    url: "https://example.com/product/p4"
  }
];
