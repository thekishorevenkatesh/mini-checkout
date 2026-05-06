const LOCATION_CATALOG = {
  India: {
    "Andaman and Nicobar Islands": ["Port Blair"],
    "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Tirupati", "Kurnool", "Rajahmundry"],
    "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat", "Tawang"],
    Assam: ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Tezpur", "Nagaon"],
    Bihar: ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur", "Darbhanga", "Purnia"],
    Chandigarh: ["Chandigarh"],
    Chhattisgarh: ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Jagdalpur"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Diu", "Silvassa"],
    Delhi: ["New Delhi", "Delhi", "Dwarka", "Rohini", "Saket", "Karol Bagh", "Pitampura"],
    Goa: ["Panaji", "Margao", "Mapusa", "Vasco da Gama", "Ponda"],
    Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar"],
    Haryana: ["Gurugram", "Faridabad", "Panipat", "Ambala", "Hisar", "Karnal", "Sonipat"],
    "Himachal Pradesh": ["Shimla", "Dharamshala", "Solan", "Mandi", "Kullu", "Manali"],
    "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Pulwama"],
    Jharkhand: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar", "Hazaribagh"],
    Karnataka: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi", "Shivamogga", "Davanagere"],
    Kerala: ["Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur", "Kollam", "Kannur", "Alappuzha"],
    Ladakh: ["Leh", "Kargil"],
    Lakshadweep: ["Kavaratti"],
    "Madhya Pradesh": ["Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Satna"],
    Maharashtra: ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Aurangabad", "Kolhapur", "Solapur", "Amravati"],
    Manipur: ["Imphal", "Thoubal", "Bishnupur", "Churachandpur"],
    Meghalaya: ["Shillong", "Tura", "Jowai"],
    Mizoram: ["Aizawl", "Lunglei", "Champhai"],
    Nagaland: ["Kohima", "Dimapur", "Mokokchung", "Tuensang"],
    Odisha: ["Bhubaneswar", "Cuttack", "Rourkela", "Puri", "Sambalpur", "Berhampur", "Balasore"],
    Puducherry: ["Puducherry", "Karaikal"],
    Punjab: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Mohali", "Bathinda", "Pathankot"],
    Rajasthan: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Alwar"],
    Sikkim: ["Gangtok", "Namchi", "Mangan", "Gyalshing"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli", "Tirunelveli", "Erode", "Vellore"],
    Telangana: ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Mahbubnagar"],
    Tripura: ["Agartala", "Udaipur", "Dharmanagar", "Kailasahar"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Noida", "Varanasi", "Agra", "Ghaziabad", "Meerut", "Prayagraj", "Bareilly", "Gorakhpur"],
    Uttarakhand: ["Dehradun", "Haridwar", "Haldwani", "Roorkee", "Rishikesh", "Nainital"],
    "West Bengal": ["Kolkata", "Howrah", "Siliguri", "Durgapur", "Asansol", "Kharagpur", "Darjeeling"],
  },
  "United States": {
    Arizona: ["Phoenix", "Tucson", "Scottsdale", "Mesa"],
    California: ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento", "Fresno", "Oakland"],
    Colorado: ["Denver", "Colorado Springs", "Boulder", "Aurora"],
    Florida: ["Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale"],
    Georgia: ["Atlanta", "Savannah", "Augusta", "Athens"],
    Illinois: ["Chicago", "Springfield", "Naperville", "Peoria"],
    Massachusetts: ["Boston", "Cambridge", "Worcester", "Springfield"],
    Michigan: ["Detroit", "Ann Arbor", "Grand Rapids", "Lansing"],
    Nevada: ["Las Vegas", "Reno", "Henderson"],
    "New Jersey": ["Newark", "Jersey City", "Princeton", "Trenton"],
    "New York": ["New York City", "Buffalo", "Albany", "Rochester", "Syracuse"],
    "North Carolina": ["Charlotte", "Raleigh", "Durham", "Greensboro"],
    Ohio: ["Columbus", "Cleveland", "Cincinnati", "Toledo"],
    Pennsylvania: ["Philadelphia", "Pittsburgh", "Harrisburg", "Allentown"],
    Texas: ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "El Paso"],
    Virginia: ["Richmond", "Virginia Beach", "Arlington", "Norfolk"],
    Washington: ["Seattle", "Spokane", "Bellevue", "Tacoma"],
  },
  Canada: {
    Alberta: ["Calgary", "Edmonton", "Red Deer"],
    "British Columbia": ["Vancouver", "Victoria", "Surrey", "Burnaby"],
    Manitoba: ["Winnipeg", "Brandon"],
    "New Brunswick": ["Moncton", "Fredericton", "Saint John"],
    "Nova Scotia": ["Halifax", "Sydney"],
    Ontario: ["Toronto", "Ottawa", "Mississauga", "Hamilton", "London"],
    Quebec: ["Montreal", "Quebec City", "Laval", "Gatineau"],
    Saskatchewan: ["Saskatoon", "Regina"],
  },
  "United Kingdom": {
    England: ["London", "Manchester", "Birmingham", "Leeds", "Liverpool", "Bristol"],
    Scotland: ["Edinburgh", "Glasgow", "Aberdeen", "Dundee"],
    Wales: ["Cardiff", "Swansea", "Newport"],
    "Northern Ireland": ["Belfast", "Derry", "Lisburn"],
  },
  Australia: {
    "New South Wales": ["Sydney", "Newcastle", "Wollongong"],
    Queensland: ["Brisbane", "Gold Coast", "Cairns", "Townsville"],
    "South Australia": ["Adelaide", "Mount Gambier"],
    Tasmania: ["Hobart", "Launceston"],
    Victoria: ["Melbourne", "Geelong", "Ballarat"],
    "Western Australia": ["Perth", "Fremantle", "Bunbury"],
  },
  "United Arab Emirates": {
    "Abu Dhabi": ["Abu Dhabi", "Al Ain"],
    Ajman: ["Ajman"],
    Dubai: ["Dubai"],
    Fujairah: ["Fujairah"],
    "Ras Al Khaimah": ["Ras Al Khaimah"],
    Sharjah: ["Sharjah"],
  },
  Singapore: {
    Singapore: ["Singapore"],
  },
  Germany: {
    Bavaria: ["Munich", "Nuremberg", "Augsburg"],
    Berlin: ["Berlin"],
    Hamburg: ["Hamburg"],
    Hesse: ["Frankfurt", "Wiesbaden", "Darmstadt"],
    "North Rhine-Westphalia": ["Cologne", "Dusseldorf", "Dortmund", "Bonn"],
  },
  France: {
    "Auvergne-Rhone-Alpes": ["Lyon", "Grenoble", "Saint-Etienne"],
    "Ile-de-France": ["Paris", "Versailles", "Boulogne-Billancourt"],
    Provence: ["Marseille", "Nice", "Cannes"],
  },
  "Saudi Arabia": {
    "Eastern Province": ["Dammam", "Khobar", "Dhahran"],
    Makkah: ["Jeddah", "Mecca", "Taif"],
    Riyadh: ["Riyadh"],
  },
  Malaysia: {
    Johor: ["Johor Bahru", "Batu Pahat"],
    "Kuala Lumpur": ["Kuala Lumpur"],
    Penang: ["George Town", "Butterworth"],
    Selangor: ["Shah Alam", "Petaling Jaya", "Subang Jaya", "Klang"],
  },
  "South Africa": {
    Gauteng: ["Johannesburg", "Pretoria", "Sandton"],
    "KwaZulu-Natal": ["Durban", "Pietermaritzburg"],
    "Western Cape": ["Cape Town", "Stellenbosch"],
  },
} as const;

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function filterSuggestions(values: string[], query: string) {
  const cleanQuery = normalizeValue(query);
  if (!cleanQuery) return uniqueSorted(values);

  const startsWith = values.filter((value) => normalizeValue(value).startsWith(cleanQuery));
  const includes = values.filter(
    (value) => !normalizeValue(value).startsWith(cleanQuery) && normalizeValue(value).includes(cleanQuery)
  );

  return uniqueSorted([...startsWith, ...includes]);
}

function findCountryKey(country: string) {
  const cleanCountry = normalizeValue(country);
  return Object.keys(LOCATION_CATALOG).find((entry) => normalizeValue(entry) === cleanCountry) || "";
}

function findStateKey(country: string, state: string) {
  const countryKey = findCountryKey(country);
  if (!countryKey) return "";

  const cleanState = normalizeValue(state);
  return Object.keys(LOCATION_CATALOG[countryKey as keyof typeof LOCATION_CATALOG]).find(
    (entry) => normalizeValue(entry) === cleanState
  ) || "";
}

export function getCountrySuggestions(query = "") {
  return filterSuggestions(Object.keys(LOCATION_CATALOG), query);
}

export function getStateSuggestions(country: string, query = "") {
  const countryKey = findCountryKey(country);
  if (!countryKey) return [];
  return filterSuggestions(Object.keys(LOCATION_CATALOG[countryKey as keyof typeof LOCATION_CATALOG]), query);
}

export function getCitySuggestions(country: string, state: string, query = "") {
  const countryKey = findCountryKey(country);
  if (!countryKey) return [];

  const states = LOCATION_CATALOG[countryKey as keyof typeof LOCATION_CATALOG];
  const stateKey = findStateKey(country, state);
  const cities = stateKey
    ? states[stateKey as keyof typeof states]
    : Object.values(states).flatMap((entries) => [...entries]);

  return filterSuggestions(cities, query);
}
