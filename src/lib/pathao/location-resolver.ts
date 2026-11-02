import { getPathaoCities, getPathaoZones } from "./client";

export interface DistrictInfo {
  city_id: number;
  city_name: string;
  bengali_name: string;
  aliases: string[];
}

/**
 * All 64 Districts of Bangladesh mapped directly to Pathao's 64 city IDs.
 * Includes English names, official Bengali district names, and common Upazilas/variations.
 */
export const BANGLADESH_DISTRICTS: DistrictInfo[] = [
  {
    city_id: 1,
    city_name: "Dhaka",
    bengali_name: "ঢাকা",
    aliases: [
      "dhaka", "dacca", "dhaka city", "dhaka north", "dhaka south", "dhanmondi", "gulshan", "banani",
      "mirpur", "uttara", "mohammadpur", "badda", "rampura", "motijheel", "khilgaon", "jatrabari",
      "keraniganj", "savar", "ashulia", "dhamrai", "old dhaka",
      "ঢাকা", "মিরপুর", "উত্তরা", "ধানমন্ডি", "গুলশান", "বনানী", "সাভার", "আশুলিয়া", "কেরানীগঞ্জ", "কেরানিগঞ্জ"
    ],
  },
  {
    city_id: 2,
    city_name: "Chittagong",
    bengali_name: "চট্টগ্রাম",
    aliases: [
      "chittagong", "chattogram", "ctg", "chattagram", "agrabad", "chawkbazar", "halishahar", "panchlaish", "potia",
      "চট্টগ্রাম", "চিটাগাং", "আগ্রাবাদ", "হালিশহর", "পাঁচলাইশ", "পটিয়া"
    ],
  },
  {
    city_id: 3,
    city_name: "Sylhet",
    bengali_name: "সিলেট",
    aliases: ["sylhet", "silhet", "সিলেট", "সিলট", "জৈন্তাপুর", "গোলাপগঞ্জ", "বিয়ানীবাজার"],
  },
  {
    city_id: 4,
    city_name: "Rajshahi",
    bengali_name: "রাজশাহী",
    aliases: ["rajshahi", "রাজশাহী", "বাঘা", "চারঘাট", "পুঠিয়া", "তানোর", "গোদাগাড়ী"],
  },
  {
    city_id: 5,
    city_name: "Cumilla",
    bengali_name: "কুমিল্লা",
    aliases: ["cumilla", "comilla", "কুমিল্লা", "দাউদকান্দি", "চৌদ্দগ্রাম", "লাকসাম", "বরুড়া"],
  },
  {
    city_id: 6,
    city_name: "Feni",
    bengali_name: "ফেনী",
    aliases: ["feni", "ফেনী", "দাগনভূঞা", "ছাগলনাইয়া", "পরশুরাম", "সোনাগাজী"],
  },
  {
    city_id: 7,
    city_name: "Noakhali",
    bengali_name: "নোয়াখালী",
    aliases: ["noakhali", "নোয়াখালী", "নোয়াখালী", "মাইজদী", "বেগমগঞ্জ", "চাটখিল", "হাতিয়া", "সেনবাগ"],
  },
  {
    city_id: 8,
    city_name: "Chandpur",
    bengali_name: "চাঁদপুর",
    aliases: ["chandpur", "চাঁদপুর", "হাজীগঞ্জ", "মতলব", "শাহরাস্তি", "ফরিদগঞ্জ"],
  },
  {
    city_id: 9,
    city_name: "Bogra",
    bengali_name: "বগুড়া",
    aliases: ["bogra", "bogura", "বগুড়া", "বগুড়া", "শেরপুর", "শিবগঞ্জ", "ধুনট", "গাবতলী"],
  },
  {
    city_id: 10,
    city_name: "Sirajganj",
    bengali_name: "সিরাজগঞ্জ",
    aliases: ["sirajganj", "সিরাজগঞ্জ", "শাহজাদপুর", "উল্লাপাড়া", "বেলকুচি", "রায়গঞ্জ"],
  },
  {
    city_id: 11,
    city_name: "Cox's Bazar",
    bengali_name: "কক্সবাজার",
    aliases: ["cox's bazar", "coxs bazar", "coxsbazar", "কক্সবাজার", "চকরিয়া", "টেকনাফ", "উখিয়া", "রামু"],
  },
  {
    city_id: 12,
    city_name: "Moulvibazar",
    bengali_name: "মৌলভীবাজার",
    aliases: ["moulvibazar", "maulvibazar", "মৌলভীবাজার", "শ্রীমঙ্গল", "কুলাউড়া", "কমলগঞ্জ"],
  },
  {
    city_id: 13,
    city_name: "Tangail",
    bengali_name: "টাঙ্গাইল",
    aliases: ["tangail", "টাঙ্গাইল", "মির্জাপুর", "মধুপুর", "ঘাটাইল", "গোপালপুর", "সখিপুর"],
  },
  {
    city_id: 14,
    city_name: "Natore",
    bengali_name: "নাটোর",
    aliases: ["natore", "নাটোর", "সিংড়া", "বড়াইগ্রাম", "গুরুদাসপুর", "বাগাতিপাড়া"],
  },
  {
    city_id: 15,
    city_name: "Chapainawabganj",
    bengali_name: "চাঁপাইনবাবগঞ্জ",
    aliases: ["chapainawabganj", "nawabganj", "চাঁপাইনবাবগঞ্জ", "নবাবগঞ্জ", "শিবগঞ্জ", "গোমস্তাপুর"],
  },
  {
    city_id: 16,
    city_name: "Manikganj",
    bengali_name: "মানিকগঞ্জ",
    aliases: ["manikganj", "মানিকগঞ্জ", "সিংগাইর", "শিবালয়", "সাটুরিয়া", "ঘিওর"],
  },
  {
    city_id: 17,
    city_name: "Barisal",
    bengali_name: "বরিশাল",
    aliases: ["barisal", "barishal", "বরিশাল", "বাকেরগঞ্জ", "বানারীপাড়া", "গৌরনদী", "বাবুগঞ্জ"],
  },
  {
    city_id: 18,
    city_name: "Faridpur",
    bengali_name: "ফরিদপুর",
    aliases: ["faridpur", "ফরিদপুর", "ভাঙ্গা", "বোয়ালমারী", "মধুখালী", "নগরকান্দা"],
  },
  {
    city_id: 19,
    city_name: "Jashore",
    bengali_name: "যশোর",
    aliases: ["jashore", "jessore", "যশোর", "বেনাপোল", "ঝিকরগাছা", "মনিরামপুর", "অভয়নগর", "কেশবপুর"],
  },
  {
    city_id: 20,
    city_name: "Khulna",
    bengali_name: "খুলনা",
    aliases: ["khulna", "খুলনা", "ডুমুরিয়া", "রূপসা", "ফুলতলা", "তেরখাদা", "পাইকগাছা"],
  },
  {
    city_id: 21,
    city_name: "Narayanganj",
    bengali_name: "নারায়ণগঞ্জ",
    aliases: ["narayanganj", "নারায়ণগঞ্জ", "নারায়ণগঞ্জ", "সিদ্ধিরগঞ্জ", "ফতুল্লা", "সোনারগাঁও", "রূপগঞ্জ", "আড়াইহাজার"],
  },
  {
    city_id: 22,
    city_name: "Gazipur",
    bengali_name: "গাজীপুর",
    aliases: ["gazipur", "গাজীপুর", "টঙ্গী", "tongi", "শ্রীপুর", "কালিয়াকৈর", "কালিগঞ্জ", "কাপাসিয়া"],
  },
  {
    city_id: 23,
    city_name: "Munsiganj",
    bengali_name: "মুন্সিগঞ্জ",
    aliases: ["munsiganj", "munshiganj", "মুন্সিগঞ্জ", "মুন্সীগঞ্জ", "শ্রীনগর", "সিরাজদিখান", "গজারিয়া", "টঙ্গীবাড়ি"],
  },
  {
    city_id: 24,
    city_name: "Pabna",
    bengali_name: "পাবনা",
    aliases: ["pabna", "পাবনা", "ঈশ্বরদী", "ishwardi", "সাঁথিয়া", "সুজানগর", "চাটমোহর", "বেড়া"],
  },
  {
    city_id: 25,
    city_name: "Rangpur",
    bengali_name: "রংপুর",
    aliases: ["rangpur", "রংপুর", "পীরগঞ্জ", "বদরগঞ্জ", "মিঠাপুকুর", "কাউনিয়া", "তারাগঞ্জ"],
  },
  {
    city_id: 26,
    city_name: "Mymensingh",
    bengali_name: "ময়মনসিংহ",
    aliases: ["mymensingh", "ময়মনসিংহ", "ময়মনসিংহ", "ভালুকা", "ত্রিশাল", "মুক্তাগাছা", "গফরগাঁও", "ফুলবাড়িয়া"],
  },
  {
    city_id: 27,
    city_name: "Jhalokathi",
    bengali_name: "ঝালকাঠি",
    aliases: ["jhalokathi", "jhalakati", "ঝালকাঠি", "ঝালকাঠী", "নলছিটি", "রাজাপুর", "কাঠালিয়া"],
  },
  {
    city_id: 28,
    city_name: "Kushtia",
    bengali_name: "কুষ্টিয়া",
    aliases: ["kushtia", "কুষ্টিয়া", "কুষ্টিয়া", "কুমারখালী", "ভেড়ামারা", "মিরপুর", "দৌলতপুর"],
  },
  {
    city_id: 29,
    city_name: "Patuakhali",
    bengali_name: "পটুয়াখালী",
    aliases: ["patuakhali", "পটুয়াখালী", "পটুয়াখালী", "কুয়াকাটা", "গলাচিপা", "বাউফল", "মির্জাগঞ্জ"],
  },
  {
    city_id: 30,
    city_name: "Habiganj",
    bengali_name: "হবিগঞ্জ",
    aliases: ["habiganj", "হবিগঞ্জ", "মাধবপুর", "চুনারুঘাট", "নবীগঞ্জ", "বাহুবল"],
  },
  {
    city_id: 31,
    city_name: "Pirojpur",
    bengali_name: "পিরোজপুর",
    aliases: ["pirojpur", "পিরোজপুর", "ভাণ্ডারিয়া", "মঠবাড়িয়া", "নেছারাবাদ", "নাজিরপুর"],
  },
  {
    city_id: 32,
    city_name: "B. Baria",
    bengali_name: "ব্রাহ্মণবাড়িয়া",
    aliases: ["b. baria", "b.baria", "brahmanbaria", "bbaria", "ব্রাহ্মণবাড়িয়া", "ব্রাহ্মণবাড়িয়া", "বি বাড়িয়া", "আশুগঞ্জ", "কসবা", "নবীনগর"],
  },
  {
    city_id: 33,
    city_name: "Sherpur",
    bengali_name: "শেরপুর",
    aliases: ["sherpur", "শেরপুর", "নকলা", "নালিতাবাড়ী", "শ্রীবরদী", "ঝিনাইগাতী"],
  },
  {
    city_id: 34,
    city_name: "Barguna ",
    bengali_name: "বরগুনা",
    aliases: ["barguna", "বরগুনা", "আমতলী", "পাথরঘাটা", "বামনা", "বেতাগী"],
  },
  {
    city_id: 35,
    city_name: "Dinajpur",
    bengali_name: "দিনাজপুর",
    aliases: ["dinajpur", "দিনাজপুর", "বিরামপুর", "বীরগঞ্জ", "ফুলবাড়ী", "পার্বতীপুর"],
  },
  {
    city_id: 36,
    city_name: "Thakurgaon ",
    bengali_name: "ঠাকুরগাঁও",
    aliases: ["thakurgaon", "ঠাকুরগাঁও", "পীরগঞ্জ", "রানীশংকৈল", "হরিপুর"],
  },
  {
    city_id: 37,
    city_name: "Panchagarh",
    bengali_name: "পঞ্চগড়",
    aliases: ["panchagarh", "পঞ্চগড়", "পঞ্চগড়", "তেঁতুলিয়া", "দেবীগঞ্জ", "বোদা"],
  },
  {
    city_id: 38,
    city_name: "Gaibandha",
    bengali_name: "গাইবান্ধা",
    aliases: ["gaibandha", "গাইবান্ধা", "গোবিন্দগঞ্জ", "পলাশবাড়ী", "সাদুল্লাপুর", "সুন্দরগঞ্জ"],
  },
  {
    city_id: 39,
    city_name: "Nilphamari",
    bengali_name: "নীলফামারী",
    aliases: ["nilphamari", "নীলফামারী", "সৈয়দপুর", "sayedpur", "জলঢাকা", "ডোমার", "কিশোরগঞ্জ"],
  },
  {
    city_id: 40,
    city_name: "Lakshmipur",
    bengali_name: "লক্ষ্মীপুর",
    aliases: ["lakshmipur", "laxmipur", "লক্ষ্মীপুর", "লক্ষীপুর", "রায়পুর", "রামগঞ্জ", "রামগতি"],
  },
  {
    city_id: 41,
    city_name: "Jamalpur",
    bengali_name: "জামালপুর",
    aliases: ["jamalpur", "জামালপুর", "সরিষাবাড়ী", "মেলান্দহ", "ইসলামপুর", "মাদারগঞ্জ", "বকশীগঞ্জ"],
  },
  {
    city_id: 42,
    city_name: "Kishoreganj",
    bengali_name: "কিশোরগঞ্জ",
    aliases: ["kishoreganj", "কিশোরগঞ্জ", "ভৈরব", "bhairab", "বাজিতপুর", "কটিয়াদী", "করিমগঞ্জ"],
  },
  {
    city_id: 43,
    city_name: "Madaripur",
    bengali_name: "মাদারীপুর",
    aliases: ["madaripur", "মাদারীপুর", "শিবচর", "কালকিনি", "রাজৈর"],
  },
  {
    city_id: 44,
    city_name: "Netrakona",
    bengali_name: "নেত্রকোনা",
    aliases: ["netrakona", "নেত্রকোনা", "মোহনগঞ্জ", "কেন্দুয়া", "দুর্গাপুর", "কলমাকান্দা"],
  },
  {
    city_id: 45,
    city_name: "Sunamganj",
    bengali_name: "সুনামগঞ্জ",
    aliases: ["sunamganj", "সুনামগঞ্জ", "ছাতক", "জগন্নাথপুর", "তাহিরপুর", "দিরাই"],
  },
  {
    city_id: 46,
    city_name: "Naogaon",
    bengali_name: "নওগাঁ",
    aliases: ["naogaon", "নওগাঁ", "পত্নীতলা", "মহাদেবপুর", "মান্দা", "ধামইরহাট"],
  },
  {
    city_id: 47,
    city_name: "Narshingdi",
    bengali_name: "নরসিংদী",
    aliases: [
      "narshingdi", "narsingdi", "narsindi", "নরসিংদী", "নরসিংদি",
      "রায়পুরা", "raipura", "পলাশ", "palash", "মনোহরদী", "monohardi", "monohordi",
      "বেলাবো", "বেলাব", "belabo", "শিবপুর", "shibpur", "মাধবদী", "madhabdi", "ঘোড়াশাল", "ghorashal", "পাঁচদোনা"
    ],
  },
  {
    city_id: 48,
    city_name: "Joypurhat",
    bengali_name: "জয়পুরহাট",
    aliases: ["joypurhat", "জয়পুরহাট", "জয়পুরহাট", "পাঁচবিবি", "কালাই", "ক্ষেতলাল"],
  },
  {
    city_id: 49,
    city_name: "Jhenidah",
    bengali_name: "ঝিনাইদহ",
    aliases: ["jhenidah", "jhenaidah", "ঝিনাইদহ", "কালীগঞ্জ", "কোটচাঁদপুর", "মহেশপুর", "শৈলকুপা"],
  },
  {
    city_id: 50,
    city_name: "Meherpur",
    bengali_name: "মেহেরপুর",
    aliases: ["meherpur", "মেহেরপুর", "গাংনী", "মুজিবনগর"],
  },
  {
    city_id: 51,
    city_name: "Satkhira",
    bengali_name: "সাতক্ষীরা",
    aliases: ["satkhira", "সাতক্ষীরা", "কলারোয়া", "তালা", "কালীগঞ্জ", "শ্যামনগর", "আশাশুনি"],
  },
  {
    city_id: 52,
    city_name: "Bagerhat",
    bengali_name: "বাগেরহাট",
    aliases: ["bagerhat", "বাগেরহাট", "মোংলা", "mongla", "ফকিরহাট", "রামপাল", "মোল্লাহাট"],
  },
  {
    city_id: 53,
    city_name: "Bhola",
    bengali_name: "ভোলা",
    aliases: ["bhola", "ভোলা", "চরফ্যাশন", "লালমোহন", "বোরহানউদ্দিন", "দৌলতখান"],
  },
  {
    city_id: 54,
    city_name: "Narail ",
    bengali_name: "নড়াইল",
    aliases: ["narail", "নড়াইল", "নড়াইল", "লোহাগড়া", "কালিয়া"],
  },
  {
    city_id: 55,
    city_name: "Kurigram ",
    bengali_name: "কুড়িগ্রাম",
    aliases: ["kurigram", "কুড়িগ্রাম", "কুড়িগ্রাম", "নাগেশ্বরী", "ভুরুঙ্গামারী", "উলিপুর", "চিলমারী"],
  },
  {
    city_id: 56,
    city_name: "Gopalgonj ",
    bengali_name: "গোপালগঞ্জ",
    aliases: ["gopalgonj", "gopalganj", "গোপালগঞ্জ", "টুঙ্গিপাড়া", "কোটালীপাড়া", "কাশিয়ানী", "মুকসুদপুর"],
  },
  {
    city_id: 57,
    city_name: "Lalmonirhat ",
    bengali_name: "লালমনিরহাট",
    aliases: ["lalmonirhat", "লালমনিরহাট", "পাটগ্রাম", "হাতীবান্ধা", "কালীগঞ্জ"],
  },
  {
    city_id: 58,
    city_name: "Rajbari ",
    bengali_name: "রাজবাড়ী",
    aliases: ["rajbari", "রাজবাড়ী", "রাজবাড়ী", "গোয়ালন্দ", "পাংশা", "বালিয়াকান্দি"],
  },
  {
    city_id: 59,
    city_name: "Rangamati ",
    bengali_name: "রাঙ্গামাটি",
    aliases: ["rangamati", "রাঙ্গামাটি", "কাপ্তাই", "বাঘাইছড়ি", "কাউখালী"],
  },
  {
    city_id: 60,
    city_name: "Magura ",
    bengali_name: "মাগুরা",
    aliases: ["magura", "মাগুরা", "শ্রীপুর", "শালিখা", "মহম্মদপুর"],
  },
  {
    city_id: 61,
    city_name: "Chuadanga",
    bengali_name: "চুয়াডাঙ্গা",
    aliases: ["chuadanga", "চুয়াডাঙ্গা", "চুয়াডাঙ্গা", "দামুড়হুদা", "আলমডাঙ্গা", "জীবননগর"],
  },
  {
    city_id: 62,
    city_name: "Bandarban ",
    bengali_name: "বান্দরবান",
    aliases: ["bandarban", "বান্দরবান", "রুমা", "থানচি", "লামা", "আলীকদম"],
  },
  {
    city_id: 63,
    city_name: "Khagrachari",
    bengali_name: "খাগড়াছড়ি",
    aliases: ["khagrachari", "খাগড়াছড়ি", "খাগড়াছড়ি", "দীঘিনালা", "রামগড়", "মাটিরাঙ্গা"],
  },
  {
    city_id: 64,
    city_name: "Shariatpur ",
    bengali_name: "শরীয়তপুর",
    aliases: ["shariatpur", "শরীয়তপুর", "শরিয়তপুর", "জাজিরা", "নড়িয়া", "ডামুড্যা", "ভেদরগঞ্জ"],
  },
];

/**
 * Common Bengali Upazila & Thana transliterations for zone matching
 */
const BENGALI_SUBDISTRICTS: Record<string, string> = {
  "রায়পুরা": "raipura",
  "পলাশ": "palash",
  "মনোহরদী": "monohardi",
  "বেলাবো": "belabo",
  "বেলাব": "belabo",
  "শিবপুর": "shibpur",
  "মাধবদী": "madhabdi",
  "ঘোড়াশাল": "ghorashal",
  "পাঁচদোনা": "pachdona",
  "মিরপুর": "mirpur",
  "উত্তরা": "uttara",
  "ধানমন্ডি": "dhanmondi",
  "গুলশান": "gulshan",
  "বনানী": "banani",
  "মোহাম্মদপুর": "mohammadpur",
  "বাড্ডা": "badda",
  "রামপুরা": "rampura",
  "মতিঝিল": "motijheel",
  "খিলগাঁও": "khilgaon",
  "যাত্রাবাড়ী": "jatrabari",
  "যাত্রাবাড়ি": "jatrabari",
  "কেরানীগঞ্জ": "keraniganj",
  "কেরানিগঞ্জ": "keraniganj",
  "সাভার": "savar",
  "আশুলিয়া": "ashulia",
  "আশুলিয়া": "ashulia",
  "ধামরাই": "dhamrai",
  "টঙ্গী": "tongi",
  "কালিয়াকৈর": "kaliakair",
  "শ্রীপুর": "sreepur",
  "সিদ্ধিরগঞ্জ": "siddhirganj",
  "ফতুল্লা": "fatullah",
  "সোনারগাঁও": "sonargaon",
  "রূপগঞ্জ": "rupganj",
  "আড়াইহাজার": "araihazar",
  "আগ্রাবাদ": "agrabad",
  "হালিশহর": "halishahar",
  "পাঁচলাইশ": "panchlaish",
  "চকরিয়া": "chakaria",
  "টেকনাফ": "teknaf",
  "উখিয়া": "ukhiya",
  "শ্রীমঙ্গল": "sreemangal",
  "ভৈরব": "bhairab",
  "ঈশ্বরদী": "ishwardi",
  "বেনাপোল": "benapole",
  "মোংলা": "mongla",
};

/**
 * Normalizes text for matching by removing non-alphanumeric/non-Bengali characters and lowercasing English.
 */
function normalizeText(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s\u0980-\u09FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves Pathao City ID (1-64) from address object or raw string.
 * First inspects explicit city & province fields, then searches address lines.
 */
export function resolvePathaoCity(
  addressInput: {
    city?: string | null;
    province?: string | null;
    address1?: string | null;
    address2?: string | null;
  } | string,
  fallbackToDhaka = false
): DistrictInfo | null {
  let cityField = "";
  let provinceField = "";
  let addressLines = "";

  if (typeof addressInput === "string") {
    addressLines = addressInput;
  } else if (addressInput) {
    cityField = addressInput.city || "";
    provinceField = addressInput.province || "";
    addressLines = `${addressInput.address1 || ""} ${addressInput.address2 || ""}`.trim();
  }

  const cleanCity = normalizeText(cityField);
  const cleanProvince = normalizeText(provinceField);
  const cleanAddress = normalizeText(addressLines);

  // 1. Direct match on City or Province field
  if (cleanCity) {
    for (const d of BANGLADESH_DISTRICTS) {
      if (
        cleanCity === normalizeText(d.city_name) ||
        cleanCity === normalizeText(d.bengali_name) ||
        d.aliases.some((a) => cleanCity.includes(normalizeText(a)))
      ) {
        return d;
      }
    }
  }

  if (cleanProvince) {
    for (const d of BANGLADESH_DISTRICTS) {
      if (
        cleanProvince === normalizeText(d.city_name) ||
        cleanProvince === normalizeText(d.bengali_name) ||
        d.aliases.some((a) => cleanProvince.includes(normalizeText(a)))
      ) {
        return d;
      }
    }
  }

  // 2. Search full address text: priority to longest, most specific matching alias
  const fullText = `${cleanAddress} ${cleanCity} ${cleanProvince}`.trim();
  if (fullText) {
    let bestMatch: { district: DistrictInfo; matchedLength: number } | null = null;

    for (const d of BANGLADESH_DISTRICTS) {
      const cName = normalizeText(d.city_name);
      const bName = normalizeText(d.bengali_name);

      if (fullText.includes(cName) && cName.length > (bestMatch?.matchedLength || 0)) {
        bestMatch = { district: d, matchedLength: cName.length };
      }
      if (fullText.includes(bName) && bName.length > (bestMatch?.matchedLength || 0)) {
        bestMatch = { district: d, matchedLength: bName.length };
      }
      for (const a of d.aliases) {
        const cleanA = normalizeText(a);
        if (cleanA.length >= 3 && fullText.includes(cleanA) && cleanA.length > (bestMatch?.matchedLength || 0)) {
          bestMatch = { district: d, matchedLength: cleanA.length };
        }
      }
    }

    if (bestMatch) {
      return bestMatch.district;
    }
  }

  if (fallbackToDhaka) {
    return BANGLADESH_DISTRICTS.find((d) => d.city_id === 1) || null;
  }

  return null;
}

/**
 * Resolves Pathao Zone ID for a city given the address.
 * Matches specific sub-zones/upazilas first. If none match, selects the Sadar/central zone
 * or the first zone of the city so courier consignment creation never fails.
 */
export async function resolvePathaoZone(
  cityId: number,
  addressInput: {
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
  } | string
): Promise<{ zone_id: number; zone_name: string } | null> {
  const zones = await getPathaoZones(cityId);
  if (!zones || zones.length === 0) return null;

  const rawText = typeof addressInput === "string"
    ? addressInput
    : `${addressInput.address1 || ""} ${addressInput.address2 || ""} ${addressInput.city || ""}`;
  const cleanAddress = normalizeText(rawText);

  // 1. Look for explicit zone match in address text
  for (const z of zones) {
    const cleanZoneName = normalizeText(z.zone_name);
    // Remove words like "North", "South", "Sadar" to match base upazila
    const baseZoneName = cleanZoneName.replace(/\b(north|south|sadar|east|west)\b/g, "").trim();

    if (
      (cleanZoneName.length >= 3 && cleanAddress.includes(cleanZoneName)) ||
      (baseZoneName.length >= 4 && cleanAddress.includes(baseZoneName))
    ) {
      return { zone_id: z.zone_id, zone_name: z.zone_name };
    }
  }

  // 2. Bengali transliteration matches for common zones (e.g. Raipura -> রায়পুরা)
  for (const [bnName, enName] of Object.entries(BENGALI_SUBDISTRICTS)) {
    if (cleanAddress.includes(bnName)) {
      const matchedZone = zones.find((z: any) => {
        const cz = normalizeText(z.zone_name);
        return cz.includes(enName) || enName.includes(cz.replace(/\b(north|south|sadar|east|west)\b/g, "").trim());
      });
      if (matchedZone) {
        return { zone_id: matchedZone.zone_id, zone_name: matchedZone.zone_name };
      }
    }
  }

  const district = BANGLADESH_DISTRICTS.find((d) => d.city_id === cityId);
  if (district) {
    for (const alias of district.aliases) {
      const cleanAlias = normalizeText(alias);
      if (cleanAddress.includes(cleanAlias)) {
        // Find zone that corresponds to this alias
        const matchedZone = zones.find((z: any) =>
          normalizeText(z.zone_name).includes(cleanAlias) ||
          cleanAlias.includes(normalizeText(z.zone_name).replace(/\b(north|south|sadar|east|west)\b/g, "").trim())
        );
        if (matchedZone) {
          return { zone_id: matchedZone.zone_id, zone_name: matchedZone.zone_name };
        }
      }
    }
  }

  // 3. Fallback: Find Sadar/central zone of the district, or default to the first zone
  const sadarZone = zones.find(
    (z: any) =>
      z.zone_name.toLowerCase().includes("sadar") ||
      (district && z.zone_name.toLowerCase().includes(district.city_name.toLowerCase().trim()))
  );

  if (sadarZone) {
    return { zone_id: sadarZone.zone_id, zone_name: sadarZone.zone_name };
  }

  return { zone_id: zones[0].zone_id, zone_name: zones[0].zone_name };
}
