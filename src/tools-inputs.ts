/**
 * Per-category input schema. Each category requires a known set of selectors
 * (email, phone, name, etc). A consumer uses this to render a "required inputs"
 * form, then maps each filled selector to the right param of every tool in the
 * category before running the sweep.
 */

export type SelectorKind =
  | "query"
  | "email"
  | "username"
  | "uid"
  | "userId"
  | "channelId"
  | "videoId"
  | "ytId"
  | "phone" // collapsed 10-digit
  | "fn"
  | "ln"
  | "name" // full name single field
  | "addr_num"
  | "addr_street"
  | "addr_city"
  | "addr_state"
  | "addr_zip"
  | "lat"
  | "lng"
  | "domain"
  | "ip"
  | "url"
  | "vin"
  | "plate"
  | "state"
  | "btc_addr"
  | "hash"
  | "password"
  | "ssid"
  | "channel" // telegram channel
  | "subreddit"
  | "tag"
  | "title"
  | "company"
  | "school"
  | "country"
  | "ssn";

export type CategoryInputSpec = {
  /** Display order — also drives the "all-in-one" form ordering. */
  order: number;
  /** Selectors this category needs filled in. The first is the primary. */
  selectors: SelectorKind[];
  /** Short prompt shown above the form. */
  prompt: string;
};

export const SELECTOR_META: Record<SelectorKind, { label: string; placeholder: string; example: string }> = {
  query:        { label: "Query",         placeholder: "free-text query",     example: "edward snowden" },
  email:        { label: "Email",         placeholder: "user@domain.tld",     example: "ada@protonmail.com" },
  username:     { label: "Username",      placeholder: "handle",              example: "github" },
  uid:          { label: "UID",           placeholder: "facebook numeric id", example: "100000000000000" },
  userId:       { label: "User ID",       placeholder: "instagram user id",   example: "100000000000000" },
  channelId:    { label: "Channel ID",    placeholder: "youtube channel id",  example: "UC_x5XG1OV2P6uZZ5FSM9Ttw" },
  videoId:      { label: "Video ID",      placeholder: "youtube video id",    example: "dQw4w9WgXcQ" },
  ytId:         { label: "YouTube ID",    placeholder: "youtube video id",    example: "dQw4w9WgXcQ" },
  phone:        { label: "Phone",         placeholder: "10-digit US",         example: "4155550100" },
  fn:           { label: "First Name",    placeholder: "first",               example: "Jane" },
  ln:           { label: "Last Name",     placeholder: "last",                example: "Doe" },
  name:         { label: "Full Name",     placeholder: "first last",          example: "Jane Doe" },
  addr_num:     { label: "Number",        placeholder: "1600",                example: "1600" },
  addr_street:  { label: "Street",        placeholder: "Pennsylvania Ave",    example: "Pennsylvania Ave" },
  addr_city:    { label: "City",          placeholder: "Washington",          example: "Washington" },
  addr_state:   { label: "State",         placeholder: "DC",                  example: "DC" },
  addr_zip:     { label: "ZIP",           placeholder: "20500",               example: "20500" },
  lat:          { label: "Latitude",      placeholder: "37.7749",             example: "37.7749" },
  lng:          { label: "Longitude",     placeholder: "-122.4194",           example: "-122.4194" },
  domain:       { label: "Domain",        placeholder: "example.com",         example: "example.com" },
  ip:           { label: "IP",            placeholder: "8.8.8.8",             example: "8.8.8.8" },
  url:          { label: "URL",           placeholder: "https://...",         example: "https://example.com/img.jpg" },
  vin:          { label: "VIN",           placeholder: "17-char VIN",         example: "1HGCM82633A004352" },
  plate:        { label: "Plate",         placeholder: "license plate",       example: "ABC123" },
  state:        { label: "State (plate)", placeholder: "DC",                  example: "DC" },
  btc_addr:     { label: "BTC Address",   placeholder: "bitcoin address",     example: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa" },
  hash:         { label: "Hash",          placeholder: "md5/sha1",            example: "5d41402abc4b2a76b9719d911017c592" },
  password:     { label: "Password",      placeholder: "password",            example: "hunter2" },
  ssid:         { label: "SSID",          placeholder: "wifi ssid",           example: "linksys" },
  channel:      { label: "Channel",       placeholder: "telegram channel",    example: "telegram" },
  subreddit:    { label: "Subreddit",     placeholder: "subreddit name",      example: "OSINT" },
  tag:          { label: "Tag",           placeholder: "hashtag",             example: "osint" },
  title:        { label: "Job Title",     placeholder: "engineer",            example: "engineer" },
  company:      { label: "Company",       placeholder: "company name",        example: "google" },
  school:       { label: "School",        placeholder: "school name",         example: "stanford" },
  country:      { label: "Country",       placeholder: "country",             example: "United States" },
  ssn:          { label: "SSN",           placeholder: "9 digits",            example: "000000000" },
};

export const CATEGORY_INPUTS: Record<string, CategoryInputSpec> = {
  search:      { order: 1,  selectors: ["query"], prompt: "What to search for" },
  facebook:    { order: 2,  selectors: ["uid", "query"], prompt: "Facebook UID for profile probes; query for global search" },
  twitter:     { order: 3,  selectors: ["username", "query"], prompt: "X/Twitter handle (no @); optional query" },
  instagram:   { order: 4,  selectors: ["username", "userId", "tag"], prompt: "Instagram username, user-id, or tag" },
  linkedin:    { order: 5,  selectors: ["username", "fn", "ln", "title", "company", "school"], prompt: "LinkedIn slug or attribute filters" },
  communities: { order: 6,  selectors: ["username", "query", "subreddit", "channel"], prompt: "Multi-platform — fill what you have" },
  email:       { order: 7,  selectors: ["email"], prompt: "Email address" },
  username:    { order: 8,  selectors: ["username"], prompt: "Username / handle" },
  names:       { order: 9,  selectors: ["fn", "ln"], prompt: "First and last name" },
  addresses:   { order: 10, selectors: ["addr_num", "addr_street", "addr_city", "addr_state", "addr_zip"], prompt: "Full street address" },
  telephone:   { order: 11, selectors: ["phone"], prompt: "10-digit US phone" },
  maps:        { order: 12, selectors: ["lat", "lng"], prompt: "Latitude + longitude (decimal degrees)" },
  documents:   { order: 13, selectors: ["query"], prompt: "Document keyword search" },
  images:      { order: 14, selectors: ["url", "query"], prompt: "Image URL (reverse) or keyword" },
  videos:      { order: 15, selectors: ["ytId", "query", "channelId", "videoId"], prompt: "YouTube/Vimeo IDs or query" },
  domains:     { order: 16, selectors: ["domain"], prompt: "Domain name" },
  ip:          { order: 17, selectors: ["ip", "ssid"], prompt: "IP address (or SSID for wireless)" },
  business:    { order: 18, selectors: ["name", "fn", "ln", "ssn"], prompt: "Person or company name" },
  vehicles:    { order: 19, selectors: ["vin", "plate", "state"], prompt: "VIN or license plate + state" },
  currencies:  { order: 20, selectors: ["btc_addr"], prompt: "Crypto wallet address" },
  breaches:    { order: 21, selectors: ["email", "username", "password", "domain", "ip", "name", "phone", "hash", "query"], prompt: "Any selector you have" },
  audio:       { order: 22, selectors: ["query", "country"], prompt: "Radio station name or country" },
};

/**
 * Map from tool param name → selector kind.
 * Used to feed the right user input into the right URL placeholder.
 */
export const PARAM_TO_SELECTOR: Record<string, SelectorKind> = {
  // generic
  q: "query", query: "query", search: "query", keyword: "query",
  // identity
  email: "email", username: "username", u: "username", uid: "uid",
  userId: "userId", channelId: "channelId", videoId: "videoId", ytId: "ytId",
  channel: "channel", subreddit: "subreddit", tag: "tag",
  // names
  fn: "fn", ln: "ln", fname: "fn", lname: "ln",
  firstName: "fn", lastName: "ln", name: "name",
  // address
  num: "addr_num", street: "addr_street", city: "addr_city",
  state: "addr_state", zip: "addr_zip",
  // location
  lat: "lat", lng: "lng",
  // network
  d: "domain", domain: "domain", ip: "ip", ssid: "ssid",
  url: "url", image_url: "url", imageUrl: "url",
  // phone (composite — special-cased below)
  a: "phone", b: "phone", c: "phone",
  phone: "phone", fullnumber: "phone", number: "phone",
  // vehicles
  vin: "vin", plate: "plate",
  // crypto
  addr: "btc_addr",
  // breach
  hash: "hash", password: "password",
  // employment
  title: "title", company: "company", school: "school",
  country: "country",
  ssn: "ssn",
};

/** Take a user-supplied phone like "4155550100" and return its 3/3/4 split. */
export function splitPhone(p: string): { a: string; b: string; c: string } | null {
  const digits = p.replace(/\D/g, "");
  if (digits.length === 10) return { a: digits.slice(0, 3), b: digits.slice(3, 6), c: digits.slice(6) };
  if (digits.length === 11 && digits.startsWith("1")) {
    return { a: digits.slice(1, 4), b: digits.slice(4, 7), c: digits.slice(7) };
  }
  return null;
}
