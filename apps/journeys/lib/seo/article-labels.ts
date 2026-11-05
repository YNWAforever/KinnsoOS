// Preserved labels from Remix-Kinnso b264c163, lib/i18n/messages; no authored content translation.
import type {PublicLanguage} from './public-language';
export const articleLabels={
  "en": {
    "title": "Articles",
    "categories": {
      "destinations": "Destinations",
      "dining": "Dining",
      "shopping": "Shopping"
    },
    "listing": {
      "searchPlaceholder": "Search articles",
      "filterRegion": "Region",
      "filterTag": "Tag",
      "noResults": "No articles found.",
      "resultsCount": "articles"
    },
    "pagination": {
      "prev": "Previous",
      "next": "Next",
      "page": "Page"
    }
  },
  "zh-HK": {
    "title": "文章",
    "categories": {
      "destinations": "目的地",
      "dining": "美食",
      "shopping": "購物"
    },
    "listing": {
      "searchPlaceholder": "搜尋文章",
      "filterRegion": "地區",
      "filterTag": "標籤",
      "noResults": "找不到文章。",
      "resultsCount": "篇文章"
    },
    "pagination": {
      "prev": "上一頁",
      "next": "下一頁",
      "page": "第"
    }
  },
  "zh-tw": {
    "title": "文章",
    "categories": {
      "destinations": "目的地",
      "dining": "美食",
      "shopping": "購物"
    },
    "listing": {
      "searchPlaceholder": "搜尋文章",
      "filterRegion": "地區",
      "filterTag": "標籤",
      "noResults": "找不到文章。",
      "resultsCount": "篇文章"
    },
    "pagination": {
      "prev": "上一頁",
      "next": "下一頁",
      "page": "第"
    }
  },
  "zh-cn": {
    "title": "文章",
    "categories": {
      "destinations": "目的地",
      "dining": "美食",
      "shopping": "购物"
    },
    "listing": {
      "searchPlaceholder": "搜索文章",
      "filterRegion": "地区",
      "filterTag": "标签",
      "noResults": "找不到文章。",
      "resultsCount": "篇文章"
    },
    "pagination": {
      "prev": "上一页",
      "next": "下一页",
      "page": "第"
    }
  },
  "ja": {
    "title": "記事",
    "categories": {
      "destinations": "旅行先",
      "dining": "グルメ",
      "shopping": "ショッピング"
    },
    "listing": {
      "searchPlaceholder": "記事を検索",
      "filterRegion": "地域",
      "filterTag": "タグ",
      "noResults": "記事が見つかりません。",
      "resultsCount": "件"
    },
    "pagination": {
      "prev": "前へ",
      "next": "次へ",
      "page": "ページ"
    }
  },
  "ko": {
    "title": "아티클",
    "categories": {
      "destinations": "여행지",
      "dining": "다이닝",
      "shopping": "쇼핑"
    },
    "listing": {
      "searchPlaceholder": "아티클 검색",
      "filterRegion": "지역",
      "filterTag": "태그",
      "noResults": "검색 결과가 없습니다.",
      "resultsCount": "개"
    },
    "pagination": {
      "prev": "이전",
      "next": "다음",
      "page": "페이지"
    }
  },
  "th": {
    "title": "บทความ",
    "categories": {
      "destinations": "จุดหมายปลายทาง",
      "dining": "ร้านอาหาร",
      "shopping": "ช้อปปิ้ง"
    },
    "listing": {
      "searchPlaceholder": "ค้นหาบทความ",
      "filterRegion": "ภูมิภาค",
      "filterTag": "แท็ก",
      "noResults": "ไม่พบบทความ",
      "resultsCount": "บทความ"
    },
    "pagination": {
      "prev": "ก่อนหน้า",
      "next": "ถัดไป",
      "page": "หน้า"
    }
  }
} satisfies Record<PublicLanguage,{title:string;categories:Record<'destinations'|'dining'|'shopping',string>;listing:{searchPlaceholder:string;filterRegion:string;filterTag:string;noResults:string;resultsCount:string};pagination:{prev:string;next:string;page:string}}>;
