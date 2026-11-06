/* The words made-up data is made of, in the four languages the editor speaks: common family and given names put
 * together at random (no real person's data), each with a Latin spelling for user names and email addresses; towns,
 * streets and how an address is written; phone numbers; company and product names; job titles; categories, tags,
 * titles and everyday sentences. No network: everything is here. Email addresses are only ever at example.com,
 * example.net and example.org, which are reserved for examples. */

import type { MockLocale } from "./types";

/** a name with its Latin spelling */
type Named = readonly [native: string, latin: string];

export type LocaleData = {
  family: readonly Named[];
  given: readonly Named[];
  /** how a full name is put together */
  fullName: (family: string, given: string) => string;
  /** the towns: town, region, a postcode's first digits */
  towns: readonly (readonly [town: string, region: string, post: string])[];
  streets: readonly string[];
  /** an address from its pieces */
  address: (o: { region: string; town: string; street: string; n: number; m: number; k: number }) => string;
  postcode: (post: string, digits: string) => string;
  country: string;
  phone: (digits: string) => string;
  companyStems: readonly string[];
  companyKinds: readonly string[];
  company: (stem: string, kind: string, n: number) => string;
  jobTitles: readonly string[];
  productAdjectives: readonly string[];
  productNouns: readonly string[];
  product: (adjective: string, noun: string) => string;
  categories: readonly string[];
  tags: readonly string[];
  words: readonly string[];
  sentences: readonly string[];
  /** a title from a word and a number */
  titles: readonly ((w: string, n: number) => string)[];
  /** how sentences are joined into a paragraph */
  join: string;
  currency: string;
  /** a price: from, to, step */
  price: readonly [number, number, number];
};

const ZH: LocaleData = {
  family: [["王", "wang"], ["李", "li"], ["张", "zhang"], ["刘", "liu"], ["陈", "chen"], ["杨", "yang"], ["黄", "huang"], ["赵", "zhao"], ["吴", "wu"], ["周", "zhou"], ["徐", "xu"], ["孙", "sun"], ["马", "ma"], ["朱", "zhu"], ["胡", "hu"], ["郭", "guo"], ["何", "he"], ["林", "lin"], ["罗", "luo"], ["高", "gao"], ["梁", "liang"], ["宋", "song"], ["唐", "tang"], ["许", "xu"], ["韩", "han"], ["邓", "deng"], ["冯", "feng"], ["曹", "cao"], ["彭", "peng"], ["沈", "shen"]],
  given: [["子轩", "zixuan"], ["雨桐", "yutong"], ["浩然", "haoran"], ["欣怡", "xinyi"], ["宇航", "yuhang"], ["思琪", "siqi"], ["一鸣", "yiming"], ["佳怡", "jiayi"], ["俊杰", "junjie"], ["梓涵", "zihan"], ["明轩", "mingxuan"], ["诗涵", "shihan"], ["文博", "wenbo"], ["晓雯", "xiaowen"], ["志强", "zhiqiang"], ["丽娟", "lijuan"], ["建华", "jianhua"], ["静", "jing"], ["磊", "lei"], ["芳", "fang"], ["伟", "wei"], ["敏", "min"], ["婷", "ting"], ["涛", "tao"], ["雪", "xue"], ["晨", "chen"], ["悦", "yue"], ["昊", "hao"], ["若曦", "ruoxi"], ["嘉懿", "jiayi"]],
  fullName: (f, g) => `${f}${g}`,
  towns: [["杭州市", "浙江省", "310"], ["南京市", "江苏省", "210"], ["成都市", "四川省", "610"], ["武汉市", "湖北省", "430"], ["西安市", "陕西省", "710"], ["长沙市", "湖南省", "410"], ["广州市", "广东省", "510"], ["深圳市", "广东省", "518"], ["苏州市", "江苏省", "215"], ["青岛市", "山东省", "266"], ["厦门市", "福建省", "361"], ["昆明市", "云南省", "650"], ["上海市", "上海市", "200"], ["北京市", "北京市", "100"]],
  streets: ["中山路", "人民路", "解放路", "建设路", "和平路", "文化路", "新华路", "长江路", "青年路", "光明路", "胜利路", "滨江大道", "学院路", "科技路", "园林路", "湖滨路"],
  address: ({ region, town, street, n, m }) => `${region === town ? "" : region}${town}${street}${n}号${m}栋`,
  postcode: (post, d) => `${post}${d.slice(0, 3)}`,
  country: "中国",
  phone: (d) => `1${"35789"[Number(d[0]) % 5]}${d.slice(1, 2)} ${d.slice(2, 6)} ${d.slice(6, 10)}`,
  companyStems: ["星河", "云帆", "远航", "青松", "蓝海", "晨光", "华彩", "卓越", "恒信", "万象", "启明", "嘉禾", "凌云", "知行"],
  companyKinds: ["科技", "网络", "文化", "贸易", "物流", "餐饮", "教育", "设计", "传媒", "生物"],
  company: (s, k, n) => `${s}${k}${n % 3 === 0 ? "股份有限公司" : n % 3 === 1 ? "有限公司" : "工作室"}`,
  jobTitles: ["产品经理", "前端工程师", "后端工程师", "设计师", "运营专员", "市场经理", "数据分析师", "客服主管", "测试工程师", "项目经理", "财务专员", "人事经理"],
  productAdjectives: ["经典", "复古", "轻量", "简约", "加厚", "便携", "原木", "纯棉", "防水", "多功能", "北欧风", "限定款"],
  productNouns: ["帆布鞋", "托特包", "双肩包", "保温杯", "台灯", "蓝牙耳机", "笔记本", "衬衫", "卫衣", "运动鞋", "收纳盒", "抱枕", "马克杯", "手表", "绿植", "雨伞"],
  product: (a, n) => `${a}${n}`,
  categories: ["服饰", "鞋靴", "箱包", "家居", "数码", "美妆", "食品", "运动", "图书", "母婴"],
  tags: ["新品", "热卖", "包邮", "限时", "推荐", "精选", "爆款", "好评", "特惠", "原创"],
  words: ["春天", "城市", "咖啡", "旅行", "音乐", "阳光", "海边", "周末", "书店", "花园", "星空", "早餐", "电影", "散步", "朋友"],
  sentences: [
    "这款产品适合日常通勤使用。",
    "我们会在三个工作日内发货。",
    "今天天气不错，适合出门走走。",
    "新版本修复了几个已知问题。",
    "感谢你的耐心等待。",
    "这家店的咖啡很好喝。",
    "周末一起去爬山吧。",
    "请在下单前确认收货地址。",
    "这本书讲述了一段温暖的故事。",
    "团队正在准备下周的发布。",
    "价格实惠，质量也很不错。",
    "活动期间全场满减。",
    "支持七天无理由退换。",
    "欢迎加入我们的社区。",
    "这个功能可以帮你节省时间。",
    "照片拍得很有氛围感。",
    "孩子们都很喜欢这个游戏。",
    "会议改到明天下午三点。",
    "包装很用心，送人也合适。",
    "下次还会再来光顾。",
  ],
  titles: [(w) => `关于${w}的几点想法`, (w, n) => `${n} 个让${w}更好的小技巧`, (w) => `本周${w}精选`, (w) => `${w}入门指南`, (w) => `我的${w}日记`, (w) => `一起聊聊${w}`],
  join: "",
  currency: "CNY",
  price: [9.9, 999, 0.1],
};

const EN: LocaleData = {
  family: [["Smith", "smith"], ["Johnson", "johnson"], ["Williams", "williams"], ["Brown", "brown"], ["Jones", "jones"], ["Miller", "miller"], ["Davis", "davis"], ["Garcia", "garcia"], ["Wilson", "wilson"], ["Taylor", "taylor"], ["Clark", "clark"], ["Lewis", "lewis"], ["Walker", "walker"], ["Hall", "hall"], ["Young", "young"], ["King", "king"], ["Wright", "wright"], ["Scott", "scott"], ["Green", "green"], ["Baker", "baker"], ["Adams", "adams"], ["Nelson", "nelson"], ["Carter", "carter"], ["Mitchell", "mitchell"], ["Turner", "turner"], ["Parker", "parker"], ["Collins", "collins"], ["Morris", "morris"], ["Reed", "reed"], ["Cook", "cook"]],
  given: [["Emma", "emma"], ["Liam", "liam"], ["Olivia", "olivia"], ["Noah", "noah"], ["Ava", "ava"], ["Ethan", "ethan"], ["Sophia", "sophia"], ["Mason", "mason"], ["Mia", "mia"], ["Lucas", "lucas"], ["Amelia", "amelia"], ["Oliver", "oliver"], ["Harper", "harper"], ["Elijah", "elijah"], ["Ella", "ella"], ["James", "james"], ["Grace", "grace"], ["Henry", "henry"], ["Chloe", "chloe"], ["Leo", "leo"], ["Nora", "nora"], ["Jack", "jack"], ["Lily", "lily"], ["Owen", "owen"], ["Zoe", "zoe"], ["Ryan", "ryan"], ["Hannah", "hannah"], ["Daniel", "daniel"], ["Ruby", "ruby"], ["Isaac", "isaac"]],
  fullName: (f, g) => `${g} ${f}`,
  towns: [["Springfield", "IL", "627"], ["Riverside", "CA", "925"], ["Fairview", "OR", "970"], ["Madison", "WI", "537"], ["Georgetown", "TX", "786"], ["Franklin", "TN", "370"], ["Arlington", "VA", "222"], ["Salem", "MA", "019"], ["Greenville", "SC", "296"], ["Burlington", "VT", "054"], ["Ashland", "OR", "975"], ["Lakewood", "CO", "802"], ["Clinton", "IA", "527"], ["Bristol", "CT", "060"]],
  streets: ["Maple", "Oak", "Cedar", "Pine", "Elm", "Willow", "Lake", "Hill", "Park", "Sunset", "River", "Meadow", "Highland", "Church", "Spring", "Forest"],
  address: ({ region, town, street, n, k }) => `${n} ${street} ${["St", "Ave", "Rd", "Ln", "Dr", "Way"][k % 6]}, ${town}, ${region}`,
  postcode: (post, d) => `${post}${d.slice(0, 2)}`,
  country: "United States",
  /* 555-01xx is set aside for fiction */
  phone: (d) => `(${"2345678"[Number(d[0]) % 7]}${d.slice(1, 3)}) 555-01${d.slice(3, 5)}`,
  companyStems: ["Northwind", "Bluebird", "Summit", "Evergreen", "Brightside", "Riverstone", "Lumen", "Cobalt", "Oakridge", "Pinecrest", "Harbor", "Juniper", "Silverline", "Maple & Co"],
  companyKinds: ["Labs", "Studio", "Group", "Partners", "Works", "Systems", "Goods", "Supply", "Media", "Foods"],
  company: (s, k, n) => (s.includes("&") ? s : `${s} ${k}${n % 4 === 0 ? ", Inc." : ""}`),
  jobTitles: ["Product Manager", "Frontend Engineer", "Backend Engineer", "Designer", "Marketing Lead", "Data Analyst", "Support Specialist", "QA Engineer", "Project Manager", "Accountant", "Recruiter", "Sales Manager"],
  productAdjectives: ["Classic", "Vintage", "Lightweight", "Minimal", "Cozy", "Portable", "Oak", "Cotton", "Waterproof", "Everyday", "Nordic", "Limited"],
  productNouns: ["Sneakers", "Tote Bag", "Backpack", "Water Bottle", "Desk Lamp", "Headphones", "Notebook", "Shirt", "Hoodie", "Running Shoes", "Storage Box", "Cushion", "Mug", "Watch", "Plant Pot", "Umbrella"],
  product: (a, n) => `${a} ${n}`,
  categories: ["Clothing", "Shoes", "Bags", "Home", "Electronics", "Beauty", "Food", "Sports", "Books", "Kids"],
  tags: ["new", "popular", "free shipping", "limited", "featured", "staff pick", "bestseller", "eco", "sale", "handmade"],
  words: ["spring", "city", "coffee", "travel", "music", "sunshine", "beach", "weekend", "bookshop", "garden", "stars", "breakfast", "movies", "walks", "friends"],
  sentences: [
    "Great for everyday use.",
    "We ship within three business days.",
    "The weather is lovely today, perfect for a walk.",
    "This update fixes a few known issues.",
    "Thanks for your patience.",
    "The coffee here is excellent.",
    "Let's go hiking this weekend.",
    "Please check your shipping address before you order.",
    "This book tells a warm and simple story.",
    "The team is getting ready for next week's launch.",
    "Good value and well made.",
    "Everything is on sale during the event.",
    "Free returns within thirty days.",
    "Welcome to the community.",
    "This feature saves you time every day.",
    "The photos have a lovely mood.",
    "The kids really enjoy this game.",
    "The meeting moved to three tomorrow afternoon.",
    "Thoughtfully packaged, a good gift.",
    "We will definitely come back.",
  ],
  titles: [(w) => `A few thoughts on ${w}`, (w, n) => `${n} small ways to enjoy ${w}`, (w) => `This week in ${w}`, (w) => `Getting started with ${w}`, (w) => `My ${w} diary`, (w) => `Let's talk about ${w}`],
  join: " ",
  currency: "USD",
  price: [4.99, 299, 0.01],
};

const JA: LocaleData = {
  family: [["佐藤", "sato"], ["鈴木", "suzuki"], ["高橋", "takahashi"], ["田中", "tanaka"], ["伊藤", "ito"], ["渡辺", "watanabe"], ["山本", "yamamoto"], ["中村", "nakamura"], ["小林", "kobayashi"], ["加藤", "kato"], ["吉田", "yoshida"], ["山田", "yamada"], ["佐々木", "sasaki"], ["山口", "yamaguchi"], ["松本", "matsumoto"], ["井上", "inoue"], ["木村", "kimura"], ["林", "hayashi"], ["斎藤", "saito"], ["清水", "shimizu"], ["山崎", "yamazaki"], ["森", "mori"], ["池田", "ikeda"], ["橋本", "hashimoto"], ["阿部", "abe"], ["石川", "ishikawa"], ["前田", "maeda"], ["藤田", "fujita"], ["小川", "ogawa"], ["岡田", "okada"]],
  given: [["健太", "kenta"], ["陽菜", "hina"], ["翔太", "shota"], ["結衣", "yui"], ["大翔", "hiroto"], ["美咲", "misaki"], ["蓮", "ren"], ["葵", "aoi"], ["悠斗", "yuto"], ["さくら", "sakura"], ["拓海", "takumi"], ["愛", "ai"], ["颯太", "sota"], ["花子", "hanako"], ["直樹", "naoki"], ["真由", "mayu"], ["和也", "kazuya"], ["彩", "aya"], ["隆", "takashi"], ["恵", "megumi"], ["誠", "makoto"], ["優子", "yuko"], ["亮", "ryo"], ["舞", "mai"], ["大輔", "daisuke"], ["千尋", "chihiro"], ["航", "wataru"], ["莉子", "riko"], ["智也", "tomoya"], ["奈々", "nana"]],
  fullName: (f, g) => `${f} ${g}`,
  towns: [["渋谷区", "東京都", "150"], ["新宿区", "東京都", "160"], ["横浜市中区", "神奈川県", "231"], ["大阪市北区", "大阪府", "530"], ["京都市中京区", "京都府", "604"], ["名古屋市中区", "愛知県", "460"], ["札幌市中央区", "北海道", "060"], ["福岡市博多区", "福岡県", "812"], ["神戸市中央区", "兵庫県", "650"], ["仙台市青葉区", "宮城県", "980"], ["さいたま市大宮区", "埼玉県", "330"], ["那覇市", "沖縄県", "900"]],
  streets: ["本町", "中央", "栄町", "緑町", "桜木町", "旭町", "末広町", "幸町", "若葉", "東町", "南町", "元町"],
  address: ({ region, town, street, n, m, k }) => `${region}${town}${street}${(k % 5) + 1}丁目${n % 30 + 1}-${m}`,
  postcode: (post, d) => `${post}-${d.slice(0, 4)}`,
  country: "日本",
  phone: (d) => `0${"789"[Number(d[0]) % 3]}0-${d.slice(1, 5)}-${d.slice(5, 9)}`,
  companyStems: ["さくら", "あおば", "ひかり", "みらい", "やまと", "つばさ", "青葉", "大和", "光陽", "東邦", "緑風", "朝日"],
  companyKinds: ["テクノロジー", "デザイン", "商事", "物産", "システムズ", "フーズ", "メディア", "ラボ"],
  company: (s, k, n) => (n % 2 === 0 ? `株式会社${s}${k}` : `${s}${k}株式会社`),
  jobTitles: ["プロダクトマネージャー", "フロントエンドエンジニア", "バックエンドエンジニア", "デザイナー", "マーケティング担当", "データアナリスト", "カスタマーサポート", "QA エンジニア", "プロジェクトマネージャー", "経理担当", "人事担当", "営業マネージャー"],
  productAdjectives: ["定番の", "レトロな", "軽量", "シンプルな", "厚手の", "持ち運べる", "木製の", "コットンの", "防水", "多機能", "北欧風の", "限定"],
  productNouns: ["スニーカー", "トートバッグ", "リュック", "水筒", "デスクライト", "ワイヤレスイヤホン", "ノート", "シャツ", "パーカー", "ランニングシューズ", "収納ボックス", "クッション", "マグカップ", "腕時計", "観葉植物", "傘"],
  product: (a, n) => `${a}${n}`,
  categories: ["ファッション", "シューズ", "バッグ", "インテリア", "家電", "コスメ", "食品", "スポーツ", "本", "ベビー"],
  tags: ["新着", "人気", "送料無料", "期間限定", "おすすめ", "厳選", "定番", "高評価", "セール", "手作り"],
  words: ["春", "街", "コーヒー", "旅", "音楽", "日差し", "海", "週末", "本屋", "庭", "星空", "朝ごはん", "映画", "散歩", "友だち"],
  sentences: [
    "毎日の通勤にぴったりです。",
    "3営業日以内に発送します。",
    "今日はいい天気なので散歩日和です。",
    "新しいバージョンでいくつかの不具合を修正しました。",
    "お待たせしました。",
    "このお店のコーヒーはとてもおいしいです。",
    "週末に一緒に山へ行きましょう。",
    "ご注文の前にお届け先をご確認ください。",
    "心が温まる物語の本です。",
    "チームは来週のリリースに向けて準備中です。",
    "お手頃な価格で品質も良いです。",
    "期間中は全品割引です。",
    "30日以内なら返品できます。",
    "コミュニティへようこそ。",
    "この機能で毎日の時間を節約できます。",
    "雰囲気のある写真ですね。",
    "子どもたちはこのゲームが大好きです。",
    "会議は明日の午後3時に変更になりました。",
    "丁寧な包装で、贈り物にも最適です。",
    "また利用したいと思います。",
  ],
  titles: [(w) => `${w}について思うこと`, (w, n) => `${w}を楽しむ${n}つのコツ`, (w) => `今週の${w}まとめ`, (w) => `はじめての${w}`, (w) => `わたしの${w}日記`, (w) => `${w}の話をしよう`],
  join: "",
  currency: "JPY",
  price: [300, 30000, 10],
};

const KO: LocaleData = {
  family: [["김", "kim"], ["이", "lee"], ["박", "park"], ["최", "choi"], ["정", "jung"], ["강", "kang"], ["조", "cho"], ["윤", "yoon"], ["장", "jang"], ["임", "lim"], ["한", "han"], ["오", "oh"], ["서", "seo"], ["신", "shin"], ["권", "kwon"], ["황", "hwang"], ["안", "ahn"], ["송", "song"], ["류", "ryu"], ["전", "jeon"], ["홍", "hong"], ["고", "ko"], ["문", "moon"], ["양", "yang"], ["손", "son"], ["배", "bae"], ["백", "baek"], ["허", "heo"], ["유", "yu"], ["남", "nam"]],
  given: [["민준", "minjun"], ["서연", "seoyeon"], ["도윤", "doyun"], ["지우", "jiwoo"], ["하준", "hajun"], ["서윤", "seoyun"], ["예준", "yejun"], ["하은", "haeun"], ["시우", "siwoo"], ["지민", "jimin"], ["주원", "juwon"], ["수아", "sua"], ["지호", "jiho"], ["채원", "chaewon"], ["건우", "gunwoo"], ["다은", "daeun"], ["현우", "hyunwoo"], ["유진", "yujin"], ["승민", "seungmin"], ["예린", "yerin"], ["준서", "junseo"], ["소율", "soyul"], ["우진", "woojin"], ["지아", "jia"], ["태민", "taemin"], ["나연", "nayeon"], ["성호", "sungho"], ["민지", "minji"], ["동현", "donghyun"], ["수빈", "subin"]],
  fullName: (f, g) => `${f}${g}`,
  towns: [["강남구", "서울특별시", "06"], ["마포구", "서울특별시", "04"], ["종로구", "서울특별시", "03"], ["해운대구", "부산광역시", "48"], ["수성구", "대구광역시", "42"], ["연수구", "인천광역시", "21"], ["유성구", "대전광역시", "34"], ["분당구", "경기도 성남시", "13"], ["수원시 팔달구", "경기도", "16"], ["전주시 완산구", "전라북도", "55"], ["제주시", "제주특별자치도", "63"], ["춘천시", "강원도", "24"]],
  streets: ["테헤란로", "세종대로", "강남대로", "올림픽로", "중앙로", "번영로", "해운대로", "월드컵로", "한강대로", "평화로", "대학로", "충장로"],
  address: ({ region, town, street, n, m }) => `${region} ${town} ${street} ${n}${m % 3 === 0 ? `, ${m}층` : ""}`,
  postcode: (post, d) => `${post}${d.slice(0, 3)}`,
  country: "대한민국",
  phone: (d) => `010-${d.slice(0, 4)}-${d.slice(4, 8)}`,
  companyStems: ["한빛", "푸른", "새솔", "다온", "미래", "하늘", "누리", "가온", "온새미로", "해솔", "단비", "별빛"],
  companyKinds: ["테크", "디자인", "상사", "소프트", "랩스", "푸드", "미디어", "시스템"],
  company: (s, k, n) => (n % 2 === 0 ? `(주)${s}${k}` : `${s}${k}`),
  jobTitles: ["프로덕트 매니저", "프론트엔드 개발자", "백엔드 개발자", "디자이너", "마케팅 담당자", "데이터 분석가", "고객지원 매니저", "QA 엔지니어", "프로젝트 매니저", "회계 담당자", "인사 담당자", "영업 매니저"],
  productAdjectives: ["클래식", "빈티지", "초경량", "심플", "도톰한", "휴대용", "원목", "코튼", "방수", "다용도", "북유럽풍", "한정판"],
  productNouns: ["스니커즈", "토트백", "백팩", "텀블러", "스탠드 조명", "무선 이어폰", "노트", "셔츠", "후드티", "러닝화", "수납함", "쿠션", "머그컵", "손목시계", "화분", "우산"],
  product: (a, n) => `${a} ${n}`,
  categories: ["패션", "신발", "가방", "리빙", "디지털", "뷰티", "식품", "스포츠", "도서", "유아"],
  tags: ["신상", "인기", "무료배송", "한정", "추천", "엄선", "베스트", "호평", "특가", "핸드메이드"],
  words: ["봄", "도시", "커피", "여행", "음악", "햇살", "바다", "주말", "서점", "정원", "별", "아침", "영화", "산책", "친구"],
  sentences: [
    "매일 출퇴근할 때 쓰기 좋아요.",
    "영업일 기준 3일 안에 발송됩니다.",
    "오늘은 날씨가 좋아서 산책하기 딱 좋아요.",
    "새 버전에서 몇 가지 문제를 고쳤습니다.",
    "기다려 주셔서 감사합니다.",
    "이 가게 커피가 정말 맛있어요.",
    "이번 주말에 같이 등산 가요.",
    "주문 전에 배송지를 확인해 주세요.",
    "따뜻한 이야기를 담은 책입니다.",
    "팀은 다음 주 출시를 준비하고 있습니다.",
    "가격도 착하고 품질도 좋아요.",
    "행사 기간에는 전 상품 할인합니다.",
    "30일 안에 무료로 반품할 수 있어요.",
    "커뮤니티에 오신 것을 환영합니다.",
    "이 기능으로 매일 시간을 아낄 수 있어요.",
    "사진 분위기가 정말 좋네요.",
    "아이들이 이 게임을 정말 좋아해요.",
    "회의가 내일 오후 3시로 바뀌었습니다.",
    "포장이 꼼꼼해서 선물하기 좋아요.",
    "다음에 또 이용할게요.",
  ],
  titles: [(w) => `${w}에 대한 몇 가지 생각`, (w, n) => `${w}을 즐기는 ${n}가지 방법`, (w) => `이번 주 ${w} 모음`, (w) => `처음 시작하는 ${w}`, (w) => `나의 ${w} 일기`, (w) => `${w} 이야기`],
  join: " ",
  currency: "KRW",
  price: [3000, 300000, 100],
};

export const LOCALES: Record<MockLocale, LocaleData> = { zh: ZH, en: EN, ja: JA, ko: KO };

/** the domains email addresses are made at: reserved for examples, never anyone's */
export const EMAIL_DOMAINS = ["example.com", "example.net", "example.org"];

/** the Latin words lowercase identifiers are made of (slugs, codes, user names without a person) */
export const LATIN_WORDS = ["amber", "breeze", "cedar", "delta", "ember", "fable", "grove", "harbor", "iris", "jade", "koi", "lumen", "maple", "nova", "orbit", "pixel", "quartz", "river", "sable", "tidal", "umber", "violet", "willow", "zephyr"];

/** what each language's status words are, for a status with no enum (the values themselves stay machine words) */
export const STATUS_WORDS = ["active", "pending", "inactive", "archived"];
