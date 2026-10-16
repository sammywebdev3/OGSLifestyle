/*
 * OGS Lifestyle — world data for Ogun State, Nigeria.
 *
 * Coordinates are approximate (usually within 1–3 km). The in-game
 * "Live OSM" layer loads exact, up-to-date places from OpenStreetMap,
 * so every real school, hospital and market in view can be shown.
 * Fees and salaries are rough 2025/26 Naira figures tuned for gameplay.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.OGS = root.OGS || {};
  root.OGS.Data = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const OGUN_CENTER = [6.95, 3.45];
  const OGUN_BOUNDS = [[6.3, 2.68], [7.98, 4.62]];

  // The 20 Local Government Areas and their headquarters.
  const LGAS = [
    { id: 'abeokuta-north', name: 'Abeokuta North', hq: 'Akomoje' },
    { id: 'abeokuta-south', name: 'Abeokuta South', hq: 'Ake' },
    { id: 'ado-odo-ota', name: 'Ado-Odo/Ota', hq: 'Ota' },
    { id: 'ewekoro', name: 'Ewekoro', hq: 'Itori' },
    { id: 'ifo', name: 'Ifo', hq: 'Ifo' },
    { id: 'ijebu-east', name: 'Ijebu East', hq: 'Ogbere' },
    { id: 'ijebu-north', name: 'Ijebu North', hq: 'Ijebu-Igbo' },
    { id: 'ijebu-north-east', name: 'Ijebu North East', hq: 'Atan' },
    { id: 'ijebu-ode', name: 'Ijebu Ode', hq: 'Ijebu-Ode' },
    { id: 'ikenne', name: 'Ikenne', hq: 'Ikenne' },
    { id: 'imeko-afon', name: 'Imeko Afon', hq: 'Imeko' },
    { id: 'ipokia', name: 'Ipokia', hq: 'Ipokia' },
    { id: 'obafemi-owode', name: 'Obafemi Owode', hq: 'Owode Egba' },
    { id: 'odeda', name: 'Odeda', hq: 'Odeda' },
    { id: 'odogbolu', name: 'Odogbolu', hq: 'Odogbolu' },
    { id: 'ogun-waterside', name: 'Ogun Waterside', hq: 'Abigi' },
    { id: 'remo-north', name: 'Remo North', hq: 'Isara' },
    { id: 'sagamu', name: 'Sagamu', hq: 'Sagamu' },
    { id: 'yewa-north', name: 'Yewa North', hq: 'Ayetoro' },
    { id: 'yewa-south', name: 'Yewa South', hq: 'Ilaro' },
  ];

  // rent = yearly rent for a self-contain / mini-flat in Naira.
  const TOWNS = [
    { id: 'abeokuta', name: 'Abeokuta', lga: 'abeokuta-south', lat: 7.1475, lng: 3.3619, rent: 450000, size: 'city', blurb: 'State capital, home of Olumo Rock and adire cloth.' },
    { id: 'ota', name: 'Sango-Ota', lga: 'ado-odo-ota', lat: 6.6804, lng: 3.2356, rent: 550000, size: 'city', blurb: 'Busy industrial hub on the Lagos border.' },
    { id: 'mowe', name: 'Mowe', lga: 'obafemi-owode', lat: 6.808, lng: 3.437, rent: 650000, size: 'town', blurb: 'Lagos–Ibadan Expressway commuter town near Redemption City.' },
    { id: 'ibafo', name: 'Ibafo', lga: 'obafemi-owode', lat: 6.735, lng: 3.425, rent: 650000, size: 'town', blurb: 'Fast-growing suburb on the Lagos boundary.' },
    { id: 'sagamu', name: 'Sagamu', lga: 'sagamu', lat: 6.8485, lng: 3.6463, rent: 380000, size: 'city', blurb: 'Remo heartland, kola nut trade and the famous interchange.' },
    { id: 'ijebu-ode', name: 'Ijebu-Ode', lga: 'ijebu-ode', lat: 6.8194, lng: 3.9173, rent: 380000, size: 'city', blurb: 'Seat of the Awujale and home of the Ojude Oba festival.' },
    { id: 'ifo', name: 'Ifo', lga: 'ifo', lat: 6.816, lng: 3.195, rent: 350000, size: 'town', blurb: 'Gateway between Abeokuta and Lagos.' },
    { id: 'agbara', name: 'Agbara', lga: 'ado-odo-ota', lat: 6.508, lng: 3.1, rent: 420000, size: 'town', blurb: 'Industrial estate town on the Lagos–Badagry axis.' },
    { id: 'igbesa', name: 'Igbesa', lga: 'ado-odo-ota', lat: 6.555, lng: 3.13, rent: 300000, size: 'town', blurb: 'Quiet town, home of Crawford University.' },
    { id: 'ilaro', name: 'Ilaro', lga: 'yewa-south', lat: 6.889, lng: 3.014, rent: 220000, size: 'town', blurb: 'Yewa heartland and home of Federal Poly Ilaro.' },
    { id: 'ago-iwoye', name: 'Ago-Iwoye', lga: 'ijebu-north', lat: 6.939, lng: 3.91, rent: 250000, size: 'town', blurb: 'University town of Olabisi Onabanjo University.' },
    { id: 'ijebu-igbo', name: 'Ijebu-Igbo', lga: 'ijebu-north', lat: 6.972, lng: 3.999, rent: 220000, size: 'town', blurb: 'Ijebu North headquarters.' },
    { id: 'ilishan', name: 'Ilishan-Remo', lga: 'ikenne', lat: 6.8925, lng: 3.716, rent: 320000, size: 'town', blurb: 'Home of Babcock University.' },
    { id: 'ikenne', name: 'Ikenne', lga: 'ikenne', lat: 6.866, lng: 3.712, rent: 280000, size: 'town', blurb: 'Hometown of Chief Obafemi Awolowo.' },
    { id: 'iperu', name: 'Iperu-Remo', lga: 'ikenne', lat: 6.91, lng: 3.665, rent: 260000, size: 'town', blurb: 'Remo town near the Gateway airport.' },
    { id: 'isara', name: 'Isara-Remo', lga: 'remo-north', lat: 6.99, lng: 3.68, rent: 200000, size: 'village', blurb: 'Remo North headquarters.' },
    { id: 'odogbolu', name: 'Odogbolu', lga: 'odogbolu', lat: 6.833, lng: 3.767, rent: 220000, size: 'town', blurb: 'Home of Federal Government College Odogbolu.' },
    { id: 'itori', name: 'Itori', lga: 'ewekoro', lat: 6.93, lng: 3.21, rent: 200000, size: 'town', blurb: 'Ewekoro cement country.' },
    { id: 'owode-egba', name: 'Owode Egba', lga: 'obafemi-owode', lat: 6.95, lng: 3.505, rent: 220000, size: 'town', blurb: 'Obafemi Owode LGA headquarters.' },
    { id: 'odeda', name: 'Odeda', lga: 'odeda', lat: 7.225, lng: 3.53, rent: 180000, size: 'village', blurb: 'Farming community north-east of Abeokuta.' },
    { id: 'ayetoro', name: 'Ayetoro', lga: 'yewa-north', lat: 7.233, lng: 3.033, rent: 180000, size: 'town', blurb: 'Yewa North headquarters, OOU agriculture campus.' },
    { id: 'imeko', name: 'Imeko', lga: 'imeko-afon', lat: 7.45, lng: 2.85, rent: 150000, size: 'village', blurb: 'Northern border town near Benin Republic.' },
    { id: 'idiroko', name: 'Idiroko', lga: 'ipokia', lat: 6.633, lng: 2.717, rent: 200000, size: 'town', blurb: 'Border town with Benin Republic — trade central.' },
    { id: 'ipokia', name: 'Ipokia', lga: 'ipokia', lat: 6.533, lng: 2.85, rent: 160000, size: 'village', blurb: 'Ipokia LGA headquarters.' },
    { id: 'ibese', name: 'Ibese', lga: 'yewa-north', lat: 6.965, lng: 3.025, rent: 170000, size: 'village', blurb: 'Home of a major cement plant.' },
    { id: 'abigi', name: 'Abigi', lga: 'ogun-waterside', lat: 6.47, lng: 4.38, rent: 150000, size: 'village', blurb: 'Riverine Ogun Waterside headquarters.' },
    { id: 'ogbere', name: 'Ogbere', lga: 'ijebu-east', lat: 6.75, lng: 4.08, rent: 160000, size: 'village', blurb: 'Ijebu East headquarters.' },
    { id: 'okun-owa', name: 'Okun-Owa', lga: 'ijebu-ode', lat: 6.94, lng: 3.98, rent: 180000, size: 'village', blurb: 'Home of Southwestern University.' },
  ];

  /*
   * Courses. `years` is programme length; `level` is the certificate earned.
   * `field` is matched against job requirements.
   */
  const COURSES = {
    medicine: { name: 'Medicine & Surgery (MBBS)', years: 6, level: 'BSc', field: 'medicine', smarts: 75, jambBonus: 60 },
    law: { name: 'Law (LLB)', years: 5, level: 'BSc', field: 'law', smarts: 60, jambBonus: 40 },
    nursing: { name: 'Nursing Science', years: 5, level: 'BSc', field: 'nursing', smarts: 55, jambBonus: 40 },
    pharmacy: { name: 'Pharmacy', years: 5, level: 'BSc', field: 'pharmacy', smarts: 65, jambBonus: 45 },
    vetmed: { name: 'Veterinary Medicine', years: 6, level: 'BSc', field: 'vetmed', smarts: 60, jambBonus: 30 },
    engineering: { name: 'Engineering (B.Eng)', years: 5, level: 'BSc', field: 'engineering', smarts: 55, jambBonus: 30 },
    compsci: { name: 'Computer Science', years: 4, level: 'BSc', field: 'tech', smarts: 50, jambBonus: 25 },
    accounting: { name: 'Accounting', years: 4, level: 'BSc', field: 'finance', smarts: 45, jambBonus: 20 },
    economics: { name: 'Economics', years: 4, level: 'BSc', field: 'finance', smarts: 45, jambBonus: 15 },
    masscomm: { name: 'Mass Communication', years: 4, level: 'BSc', field: 'media', smarts: 40, jambBonus: 15 },
    agric: { name: 'Agriculture', years: 5, level: 'BSc', field: 'agric', smarts: 35, jambBonus: 0 },
    education: { name: 'Education (B.Ed)', years: 4, level: 'BSc', field: 'teaching', smarts: 35, jambBonus: 0 },
    microbio: { name: 'Microbiology', years: 4, level: 'BSc', field: 'science', smarts: 45, jambBonus: 10 },
    business: { name: 'Business Administration', years: 4, level: 'BSc', field: 'business', smarts: 35, jambBonus: 5 },
    // Polytechnic (ND then optional HND)
    'nd-compsci': { name: 'Computer Science (ND)', years: 2, level: 'ND', field: 'tech', smarts: 30, jambBonus: 0 },
    'nd-accountancy': { name: 'Accountancy (ND)', years: 2, level: 'ND', field: 'finance', smarts: 30, jambBonus: 0 },
    'nd-masscomm': { name: 'Mass Communication (ND)', years: 2, level: 'ND', field: 'media', smarts: 25, jambBonus: 0 },
    'nd-electrical': { name: 'Electrical/Electronic Eng. (ND)', years: 2, level: 'ND', field: 'engineering', smarts: 35, jambBonus: 0 },
    'nd-business': { name: 'Business Administration (ND)', years: 2, level: 'ND', field: 'business', smarts: 20, jambBonus: 0 },
    'nd-slt': { name: 'Science Laboratory Tech. (ND)', years: 2, level: 'ND', field: 'science', smarts: 30, jambBonus: 0 },
    'nd-agric': { name: 'Agricultural Technology (ND)', years: 2, level: 'ND', field: 'agric', smarts: 20, jambBonus: 0 },
    // College of Education
    'nce-edu': { name: 'NCE Education', years: 3, level: 'NCE', field: 'teaching', smarts: 20, jambBonus: 0 },
    // College of Health Technology
    'chew': { name: 'Community Health (CHEW)', years: 3, level: 'ND', field: 'health', smarts: 25, jambBonus: 0 },
  };

  const LEVEL_RANK = { none: 0, FSLC: 1, SSCE: 2, NCE: 3, ND: 3, HND: 4, BSc: 4, MSc: 5, PhD: 6 };

  const UNI_COMMON = ['compsci', 'accounting', 'economics', 'business', 'microbio'];

  /*
   * Tertiary institutions. kind: university | polytechnic | coe | health.
   * owner: federal | state | private. fees = yearly tuition + charges (₦).
   */
  const INSTITUTIONS = [
    // Universities
    { id: 'funaab', name: 'Federal University of Agriculture, Abeokuta (FUNAAB)', short: 'FUNAAB', kind: 'university', owner: 'federal', town: 'abeokuta', lat: 7.229, lng: 3.44, cutoff: 180, fees: 150000, prestige: 80, courses: ['agric', 'vetmed', 'engineering', 'compsci', 'accounting', 'economics', 'microbio', 'business'] },
    { id: 'oou', name: 'Olabisi Onabanjo University, Ago-Iwoye (OOU)', short: 'OOU', kind: 'university', owner: 'state', town: 'ago-iwoye', lat: 6.94, lng: 3.92, cutoff: 180, fees: 280000, prestige: 72, courses: ['medicine', 'law', 'nursing', 'pharmacy', 'engineering', 'agric', 'education', 'masscomm', ...UNI_COMMON] },
    { id: 'tasued', name: 'Tai Solarin University of Education, Ijagun (TASUED)', short: 'TASUED', kind: 'university', owner: 'state', town: 'ijebu-ode', lat: 6.855, lng: 3.93, cutoff: 160, fees: 220000, prestige: 60, courses: ['education', 'compsci', 'accounting', 'economics', 'microbio'] },
    { id: 'maustech', name: 'Moshood Abiola University of Science & Technology, Abeokuta', short: 'MAUSTECH', kind: 'university', owner: 'state', town: 'abeokuta', lat: 7.175, lng: 3.39, cutoff: 160, fees: 230000, prestige: 55, courses: ['engineering', 'compsci', 'accounting', 'masscomm', 'business', 'microbio'] },
    { id: 'covenant', name: 'Covenant University, Ota', short: 'Covenant', kind: 'university', owner: 'private', town: 'ota', lat: 6.671, lng: 3.158, cutoff: 180, fees: 3800000, prestige: 90, courses: ['engineering', 'masscomm', 'law', ...UNI_COMMON] },
    { id: 'babcock', name: 'Babcock University, Ilishan-Remo', short: 'Babcock', kind: 'university', owner: 'private', town: 'ilishan', lat: 6.8925, lng: 3.718, cutoff: 170, fees: 4200000, prestige: 85, courses: ['medicine', 'law', 'nursing', 'masscomm', 'engineering', 'agric', ...UNI_COMMON] },
    { id: 'bells', name: 'Bells University of Technology, Ota', short: 'Bells', kind: 'university', owner: 'private', town: 'ota', lat: 6.7, lng: 3.235, cutoff: 160, fees: 1900000, prestige: 65, courses: ['engineering', 'compsci', 'accounting', 'economics', 'masscomm', 'microbio'] },
    { id: 'crescent', name: 'Crescent University, Abeokuta', short: 'Crescent', kind: 'university', owner: 'private', town: 'abeokuta', lat: 7.19, lng: 3.33, cutoff: 150, fees: 1300000, prestige: 55, courses: ['law', 'masscomm', 'nursing', ...UNI_COMMON] },
    { id: 'crawford', name: 'Crawford University, Igbesa', short: 'Crawford', kind: 'university', owner: 'private', town: 'igbesa', lat: 6.555, lng: 3.135, cutoff: 150, fees: 1400000, prestige: 52, courses: ['masscomm', 'agric', ...UNI_COMMON] },
    { id: 'mtu', name: 'Mountain Top University, Ibafo', short: 'MTU', kind: 'university', owner: 'private', town: 'ibafo', lat: 6.79, lng: 3.47, cutoff: 150, fees: 1600000, prestige: 55, courses: ['masscomm', ...UNI_COMMON] },
    { id: 'chrisland', name: 'Chrisland University, Abeokuta', short: 'Chrisland', kind: 'university', owner: 'private', town: 'abeokuta', lat: 7.1, lng: 3.4, cutoff: 150, fees: 1600000, prestige: 50, courses: ['nursing', 'masscomm', ...UNI_COMMON] },
    { id: 'mcpherson', name: 'McPherson University, Seriki-Sotayo', short: 'McPherson', kind: 'university', owner: 'private', town: 'owode-egba', lat: 6.97, lng: 3.57, cutoff: 150, fees: 1300000, prestige: 48, courses: ['masscomm', 'agric', ...UNI_COMMON] },
    { id: 'hallmark', name: 'Hallmark University, Ijebu-Itele', short: 'Hallmark', kind: 'university', owner: 'private', town: 'odogbolu', lat: 6.78, lng: 3.76, cutoff: 150, fees: 1200000, prestige: 45, courses: [...UNI_COMMON] },
    { id: 'christopher', name: 'Christopher University, Mowe', short: 'Christopher', kind: 'university', owner: 'private', town: 'mowe', lat: 6.82, lng: 3.44, cutoff: 150, fees: 1100000, prestige: 45, courses: ['masscomm', ...UNI_COMMON] },
    { id: 'southwestern', name: 'Southwestern University, Okun-Owa', short: 'Southwestern', kind: 'university', owner: 'private', town: 'okun-owa', lat: 6.945, lng: 3.985, cutoff: 150, fees: 1100000, prestige: 42, courses: ['law', ...UNI_COMMON] },
    // Polytechnics
    { id: 'fpi', name: 'Federal Polytechnic, Ilaro', short: 'Fed Poly Ilaro', kind: 'polytechnic', owner: 'federal', town: 'ilaro', lat: 6.9, lng: 3.03, cutoff: 100, fees: 90000, prestige: 55, courses: ['nd-compsci', 'nd-accountancy', 'nd-masscomm', 'nd-electrical', 'nd-business', 'nd-slt', 'nd-agric'] },
    { id: 'gaposa', name: 'Gateway ICT Polytechnic, Saapade', short: 'GAPOSA', kind: 'polytechnic', owner: 'state', town: 'iperu', lat: 6.9, lng: 3.68, cutoff: 100, fees: 110000, prestige: 42, courses: ['nd-compsci', 'nd-accountancy', 'nd-electrical', 'nd-business'] },
    { id: 'dsadegbenro', name: 'D.S. Adegbenro ICT Polytechnic, Itori-Ewekoro', short: 'DS Adegbenro Poly', kind: 'polytechnic', owner: 'state', town: 'itori', lat: 6.935, lng: 3.215, cutoff: 100, fees: 100000, prestige: 38, courses: ['nd-compsci', 'nd-accountancy', 'nd-business', 'nd-slt'] },
    { id: 'aapoly', name: 'Abraham Adesanya Polytechnic, Ijebu-Igbo', short: 'AAPOLY', kind: 'polytechnic', owner: 'state', town: 'ijebu-igbo', lat: 6.975, lng: 3.995, cutoff: 100, fees: 100000, prestige: 40, courses: ['nd-compsci', 'nd-accountancy', 'nd-masscomm', 'nd-business', 'nd-agric'] },
    { id: 'ogitech', name: 'Ogun State Institute of Technology, Igbesa', short: 'OGITECH', kind: 'polytechnic', owner: 'state', town: 'igbesa', lat: 6.56, lng: 3.125, cutoff: 100, fees: 100000, prestige: 36, courses: ['nd-compsci', 'nd-electrical', 'nd-slt', 'nd-business'] },
    { id: 'rectem', name: "Redeemer's College of Technology & Management, Mowe", short: 'RECTEM', kind: 'polytechnic', owner: 'private', town: 'mowe', lat: 6.81, lng: 3.445, cutoff: 100, fees: 450000, prestige: 40, courses: ['nd-compsci', 'nd-accountancy', 'nd-masscomm', 'nd-business'] },
    { id: 'allover', name: 'Allover Central Polytechnic, Sango-Ota', short: 'Allover Poly', kind: 'polytechnic', owner: 'private', town: 'ota', lat: 6.69, lng: 3.245, cutoff: 100, fees: 400000, prestige: 35, courses: ['nd-compsci', 'nd-accountancy', 'nd-business', 'nd-masscomm'] },
    // Colleges of Education & Health
    { id: 'fce-osiele', name: 'Federal College of Education, Osiele, Abeokuta', short: 'FCE Abeokuta', kind: 'coe', owner: 'federal', town: 'abeokuta', lat: 7.21, lng: 3.445, cutoff: 100, fees: 70000, prestige: 45, courses: ['nce-edu'] },
    { id: 'tasce', name: 'Tai Solarin College of Education, Omu-Ijebu', short: 'TASCE', kind: 'coe', owner: 'state', town: 'ijebu-ode', lat: 6.78, lng: 4.03, cutoff: 100, fees: 90000, prestige: 38, courses: ['nce-edu'] },
    { id: 'ogcoht', name: 'Ogun State College of Health Technology, Ilese-Ijebu', short: 'OGCOHT', kind: 'health', owner: 'state', town: 'ijebu-ode', lat: 6.83, lng: 3.95, cutoff: 100, fees: 150000, prestige: 42, courses: ['chew'] },
  ];

  /*
   * Secondary schools. tier: unity (federal, needs good Common Entrance score),
   * model, public, private. fees per year.
   */
  const SECONDARY = [
    { id: 'ags', name: 'Abeokuta Grammar School, Idi-Aba', town: 'abeokuta', lat: 7.133, lng: 3.352, tier: 'public', fees: 20000, gender: 'any', blurb: 'Founded 1908 — one of the oldest grammar schools in Nigeria.' },
    { id: 'bbhs', name: "Baptist Boys' High School, Saje", town: 'abeokuta', lat: 7.165, lng: 3.37, tier: 'public', fees: 20000, gender: 'male', blurb: 'Famous Abeokuta boys school.' },
    { id: 'aggs', name: "Abeokuta Girls' Grammar School, Onikolobo", town: 'abeokuta', lat: 7.128, lng: 3.34, tier: 'public', fees: 20000, gender: 'female', blurb: 'Historic girls grammar school.' },
    { id: 'lisabi', name: 'Lisabi Grammar School, Abeokuta', town: 'abeokuta', lat: 7.14, lng: 3.365, tier: 'public', fees: 20000, gender: 'any', blurb: 'Named after the Egba hero Lisabi.' },
    { id: 'nnss', name: 'Nigerian Navy Secondary School, Abeokuta', town: 'abeokuta', lat: 7.18, lng: 3.405, tier: 'unity', fees: 250000, gender: 'any', blurb: 'Disciplined military-style boarding school.' },
    { id: 'igs', name: 'Ijebu-Ode Grammar School', town: 'ijebu-ode', lat: 6.823, lng: 3.92, tier: 'public', fees: 20000, gender: 'any', blurb: 'Founded 1913.' },
    { id: 'aoc', name: 'Adeola Odutola College, Ijebu-Ode', town: 'ijebu-ode', lat: 6.812, lng: 3.93, tier: 'public', fees: 20000, gender: 'any', blurb: 'Well-known Ijebu public college.' },
    { id: 'ola', name: 'Our Lady of Apostles Secondary School, Ijebu-Ode', town: 'ijebu-ode', lat: 6.818, lng: 3.91, tier: 'public', fees: 25000, gender: 'female', blurb: 'Mission girls school.' },
    { id: 'imc', name: 'Ijebu Muslim College, Ijebu-Ode', town: 'ijebu-ode', lat: 6.826, lng: 3.925, tier: 'public', fees: 20000, gender: 'any', blurb: 'Mission college in Ijebu-Ode.' },
    { id: 'remo', name: 'Remo Secondary School, Sagamu', town: 'sagamu', lat: 6.845, lng: 3.652, tier: 'public', fees: 20000, gender: 'any', blurb: 'Pride of Remoland.' },
    { id: 'mayflower', name: 'Mayflower School, Ikenne', town: 'ikenne', lat: 6.87, lng: 3.72, tier: 'model', fees: 120000, gender: 'any', blurb: 'Founded by Dr. Tai Solarin in 1956.' },
    { id: 'fgc-odogbolu', name: 'Federal Government College, Odogbolu', town: 'odogbolu', lat: 6.835, lng: 3.775, tier: 'unity', fees: 150000, gender: 'any', blurb: 'Federal unity school.' },
    { id: 'fggc-sagamu', name: "Federal Government Girls' College, Sagamu", town: 'sagamu', lat: 6.855, lng: 3.635, tier: 'unity', fees: 150000, gender: 'female', blurb: 'Federal unity school for girls.' },
    { id: 'yewa-college', name: 'Yewa College (formerly Egbado College), Ilaro', town: 'ilaro', lat: 6.892, lng: 3.02, tier: 'public', fees: 20000, gender: 'any', blurb: 'The leading school in Yewaland.' },
    { id: 'faith-academy', name: 'Faith Academy, Canaanland, Ota', town: 'ota', lat: 6.674, lng: 3.165, tier: 'private', fees: 1500000, gender: 'any', blurb: 'Elite mission boarding school.' },
    { id: 'babcock-high', name: 'Babcock University High School, Ilishan', town: 'ilishan', lat: 6.888, lng: 3.712, tier: 'private', fees: 1200000, gender: 'any', blurb: 'Private boarding school beside the university.' },
  ];

  const PLACES = [
    // Landmarks & culture
    { id: 'olumo', name: 'Olumo Rock', kind: 'landmark', town: 'abeokuta', lat: 7.16, lng: 3.3466, fee: 3000, blurb: 'The rock that sheltered the Egba people in the 1830s.' },
    { id: 'itoku', name: 'Itoku Adire Market', kind: 'market', town: 'abeokuta', lat: 7.157, lng: 3.343, fee: 0, blurb: 'Hand-dyed adire cloth in every colour.' },
    { id: 'kuto', name: 'Kuto Market', kind: 'market', town: 'abeokuta', lat: 7.141, lng: 3.357, fee: 0, blurb: 'Busy food and general goods market.' },
    { id: 'alake', name: "Alake's Palace, Ake", kind: 'landmark', town: 'abeokuta', lat: 7.155, lng: 3.352, fee: 1000, blurb: 'Palace of the Alake of Egbaland.' },
    { id: 'oopl', name: 'Olusegun Obasanjo Presidential Library', kind: 'landmark', town: 'abeokuta', lat: 7.17, lng: 3.37, fee: 5000, blurb: 'Museum, library and wildlife park.' },
    { id: 'mko-stadium', name: 'MKO Abiola Stadium, Kuto', kind: 'leisure', town: 'abeokuta', lat: 7.143, lng: 3.36, fee: 1500, blurb: 'Watch the Ogun boys play live.' },
    { id: 'awujale', name: "Awujale's Palace (Ojude Oba ground)", kind: 'landmark', town: 'ijebu-ode', lat: 6.82, lng: 3.921, fee: 0, blurb: 'Where the colourful Ojude Oba festival holds after Eid.' },
    { id: 'sungbo', name: "Bilikisu Sungbo's Shrine & Eredo, Oke-Eri", kind: 'landmark', town: 'ijebu-ode', lat: 6.8, lng: 4.0, fee: 2000, blurb: 'Ancient earthworks linked to the legendary Queen Bilikisu Sungbo.' },
    { id: 'omo-forest', name: 'Omo Forest Reserve', kind: 'landmark', town: 'ogbere', lat: 6.85, lng: 4.4, fee: 5000, blurb: 'Rainforest home to forest elephants.' },
    { id: 'idiroko-border', name: 'Idiroko Border Post', kind: 'market', town: 'idiroko', lat: 6.632, lng: 2.718, fee: 0, blurb: 'Nigeria–Benin crossing. Trade (and customs) everywhere.' },
    { id: 'sango-market', name: 'Sango-Ota Market & Tollgate', kind: 'market', town: 'ota', lat: 6.69, lng: 3.24, fee: 0, blurb: 'Where Ogun meets Lagos. Crowded and loud.' },
    { id: 'sagamu-interchange', name: 'Sagamu Interchange', kind: 'leisure', town: 'sagamu', lat: 6.855, lng: 3.62, fee: 0, blurb: 'Famous for roadside bushmeat and traffic.' },
    // Worship
    { id: 'redemption', name: 'Redemption City (RCCG Camp)', kind: 'worship', town: 'mowe', lat: 6.8, lng: 3.455, fee: 0, blurb: 'Massive camp ground — Holy Ghost Service every month.' },
    { id: 'canaanland', name: 'Canaanland (Faith Tabernacle), Ota', kind: 'worship', town: 'ota', lat: 6.672, lng: 3.162, fee: 0, blurb: 'One of the largest church auditoriums in the world.' },
    { id: 'abeokuta-central-mosque', name: 'Abeokuta Central Mosque, Kobiti', kind: 'worship', town: 'abeokuta', lat: 7.153, lng: 3.348, fee: 0, blurb: 'Central mosque of Egbaland.' },
    // Health
    { id: 'fmc', name: 'Federal Medical Centre, Idi-Aba, Abeokuta', kind: 'hospital', town: 'abeokuta', lat: 7.135, lng: 3.355, fee: 30000, blurb: 'Major federal hospital.' },
    { id: 'oouth', name: 'Olabisi Onabanjo University Teaching Hospital, Sagamu', kind: 'hospital', town: 'sagamu', lat: 6.84, lng: 3.643, fee: 35000, blurb: 'Teaching hospital (OOUTH).' },
    { id: 'buth', name: 'Babcock University Teaching Hospital, Ilishan', kind: 'hospital', town: 'ilishan', lat: 6.893, lng: 3.714, fee: 80000, blurb: 'Private teaching hospital.' },
    { id: 'sacred-heart', name: 'Sacred Heart Hospital, Lantoro', kind: 'hospital', town: 'abeokuta', lat: 7.165, lng: 3.33, fee: 25000, blurb: 'Founded 1895 — Nigeria\'s oldest hospital.' },
    { id: 'aro', name: 'Federal Neuro-Psychiatric Hospital, Aro', kind: 'hospital', town: 'abeokuta', lat: 7.175, lng: 3.33, fee: 20000, blurb: 'Mental health care and therapy.' },
    { id: 'gh-ijebu', name: 'General Hospital, Ijebu-Ode', kind: 'hospital', town: 'ijebu-ode', lat: 6.815, lng: 3.915, fee: 15000, blurb: 'State general hospital.' },
    { id: 'gh-ota', name: 'State Hospital, Ota', kind: 'hospital', town: 'ota', lat: 6.683, lng: 3.23, fee: 15000, blurb: 'State hospital.' },
    // Workplaces
    { id: 'oke-mosan', name: 'Ogun State Secretariat, Oke-Mosan', kind: 'workplace', town: 'abeokuta', lat: 7.165, lng: 3.38, fee: 0, blurb: 'State government offices and ministries.' },
    { id: 'lafarge', name: 'Cement Plant, Ewekoro', kind: 'workplace', town: 'itori', lat: 6.94, lng: 3.205, fee: 0, blurb: 'Large cement works in Ewekoro.' },
    { id: 'ibese-cement', name: 'Cement Plant, Ibese', kind: 'workplace', town: 'ibese', lat: 6.968, lng: 3.03, fee: 0, blurb: 'One of the largest cement plants in Africa.' },
    { id: 'agbara-estate', name: 'Agbara Industrial Estate', kind: 'workplace', town: 'agbara', lat: 6.51, lng: 3.105, fee: 0, blurb: 'Factories for food, drinks and consumer goods.' },
    { id: 'ota-industrial', name: 'Ota Industrial Area (Ota–Idiroko Rd)', kind: 'workplace', town: 'ota', lat: 6.685, lng: 3.2, fee: 0, blurb: 'Steel, plastics and manufacturing plants.' },
    { id: 'sagamu-industrial', name: 'Sagamu Industrial Area (Flowergate)', kind: 'workplace', town: 'sagamu', lat: 6.88, lng: 3.6, fee: 0, blurb: 'Food & beverage factories by the interchange.' },
    { id: 'abk-tech-hub', name: 'Abeokuta Tech Hub', kind: 'workplace', town: 'abeokuta', lat: 7.15, lng: 3.375, fee: 0, blurb: 'Startups, remote devs and co-working.' },
    { id: 'gateway-airport', name: 'Gateway International Airport, Iperu-Ilishan', kind: 'workplace', town: 'iperu', lat: 6.92, lng: 3.7, fee: 0, blurb: 'Ogun State\'s new airport.' },
    { id: 'odeda-farms', name: 'Odeda Farm Settlement', kind: 'workplace', town: 'odeda', lat: 7.22, lng: 3.52, fee: 0, blurb: 'Poultry, cassava and fish farms.' },
    // Custodial centres (prisons)
    { id: 'ibara-prison', name: 'Ibara Custodial Centre, Abeokuta', kind: 'prison', town: 'abeokuta', lat: 7.138, lng: 3.33, fee: 0, blurb: 'Medium-security custodial centre in Abeokuta.' },
    { id: 'ilaro-prison', name: 'Ilaro Custodial Centre', kind: 'prison', town: 'ilaro', lat: 6.885, lng: 3.008, fee: 0, blurb: 'Custodial centre serving Yewaland.' },
    { id: 'ijebu-prison', name: 'Ijebu-Ode Custodial Centre', kind: 'prison', town: 'ijebu-ode', lat: 6.814, lng: 3.928, fee: 0, blurb: 'Custodial centre serving Ijebuland.' },
    { id: 'sagamu-prison', name: 'Sagamu Custodial Centre', kind: 'prison', town: 'sagamu', lat: 6.838, lng: 3.656, fee: 0, blurb: 'Custodial centre serving Remo.' },
  ];

  /*
   * Street crimes. reward = [min, max] ₦; risk = base chance of being caught;
   * heat = how much police attention it draws; years = sentence range.
   */
  const CRIMES = [
    { id: 'shoplift', name: 'Shoplift from a supermarket', minAge: 10, hours: 1, reward: [3000, 25000], risk: 0.15, heat: 6, years: [0.5, 1], karma: -3 },
    { id: 'pickpocket', name: 'Pickpocket at a bus park', minAge: 12, hours: 2, reward: [5000, 45000], risk: 0.14, heat: 8, years: [0.5, 2], karma: -4 },
    { id: 'phone-snatch', name: 'Snatch phones in traffic', minAge: 14, hours: 2, reward: [40000, 180000], risk: 0.2, heat: 12, years: [1, 3], karma: -6, injury: 0.1 },
    { id: 'scam', name: 'Run online romance scams (yahoo)', minAge: 15, hours: 6, reward: [0, 900000], risk: 0.08, heat: 10, years: [2, 7], karma: -8, needsPhone: true },
    { id: 'drugs', name: 'Sell weed around the junction', minAge: 16, hours: 4, reward: [30000, 250000], risk: 0.18, heat: 12, years: [2, 5], karma: -6 },
    { id: 'burglary', name: 'Burgle a house at night', minAge: 16, hours: 4, reward: [80000, 700000], risk: 0.25, heat: 18, years: [3, 7], karma: -10, night: true, injury: 0.15 },
    { id: 'smuggle', name: 'Smuggle bags of rice across Idiroko border', minAge: 18, hours: 8, reward: [150000, 900000], risk: 0.2, heat: 15, years: [2, 5], karma: -4 },
    { id: 'fuel-theft', name: 'Siphon fuel from a pipeline (very dangerous)', minAge: 18, hours: 6, reward: [200000, 1500000], risk: 0.22, heat: 20, years: [5, 10], karma: -8, injury: 0.25 },
    { id: 'embezzle', name: "Embezzle from your employer's accounts", minAge: 18, hours: 2, reward: [0, 0], risk: 0.25, heat: 15, years: [3, 10], karma: -10, needsJob: true },
    { id: 'robbery', name: 'Armed robbery', minAge: 18, hours: 5, reward: [300000, 3500000], risk: 0.35, heat: 40, years: [10, 21], karma: -25, injury: 0.35 },
  ];

  // Elective offices. cost = rough campaign budget; popularity = what a typical rival has.
  const OFFICES = [
    { id: 'councillor', name: 'Ward Councillor', level: 1, minAge: 25, cost: 3000000, popularity: 30, salary: 6000000, cycle: 'local' },
    { id: 'lg-chairman', name: 'Local Government Chairman', level: 2, minAge: 30, cost: 40000000, popularity: 45, salary: 25000000, cycle: 'local' },
    { id: 'assembly', name: 'Member, Ogun State House of Assembly', level: 2, minAge: 30, cost: 60000000, popularity: 50, salary: 40000000, cycle: 'general' },
    { id: 'reps', name: 'Member, House of Representatives', level: 3, minAge: 30, cost: 150000000, popularity: 60, salary: 90000000, cycle: 'general' },
    { id: 'senator', name: 'Senator', level: 4, minAge: 35, cost: 400000000, popularity: 70, salary: 180000000, cycle: 'general' },
    { id: 'governor', name: 'Governor of Ogun State', level: 5, minAge: 35, cost: 2000000000, popularity: 80, salary: 300000000, cycle: 'general' },
  ];

  // Fictional parties, so the game stays neutral.
  const PARTIES = [
    { id: 'ppc', name: 'Progressive People\'s Congress (PPC)', color: '#1f6feb' },
    { id: 'nda', name: 'National Democratic Alliance (NDA)', color: '#d1242f' },
    { id: 'lup', name: 'Labour Unity Party (LUP)', color: '#1a7f37' },
  ];

  /*
   * Careers. salary = starting monthly pay (₦). levels = promotion ladder.
   * req: { level, fields, nysc, skill, gender? }
   * place: a PLACES id (shown on map) or null = available in any town.
   */
  const JOBS = [
    // No qualification
    { id: 'okada', title: 'Okada Rider', place: null, salary: 150000, req: { level: 'none', minAge: 18 }, levels: ['Okada Rider', 'Okada Owner', 'Fleet Owner'], risk: 3, needsAsset: 'motorbike' },
    { id: 'keke', title: 'Keke NAPEP Driver', place: null, salary: 170000, req: { level: 'none', minAge: 18 }, levels: ['Keke Driver', 'Keke Owner', 'Keke Fleet Owner'], risk: 2, needsAsset: 'keke' },
    { id: 'trader', title: 'Market Trader', place: 'kuto', salary: 110000, req: { level: 'none', minAge: 15 }, levels: ['Petty Trader', 'Shop Owner', 'Wholesaler', 'Iyaloja/Babaloja'] },
    { id: 'adire', title: 'Adire Dyer', place: 'itoku', salary: 100000, req: { level: 'none', minAge: 15, skill: 'adire' }, levels: ['Apprentice Dyer', 'Adire Artisan', 'Adire Brand Owner'] },
    { id: 'pos', title: 'POS Agent', place: null, salary: 120000, req: { level: 'none', minAge: 16 }, levels: ['POS Agent', 'POS Super-Agent'] },
    { id: 'farmhand', title: 'Farm Hand', place: 'odeda-farms', salary: 80000, req: { level: 'none', minAge: 15 }, levels: ['Farm Hand', 'Farm Supervisor', 'Farm Manager'] },
    { id: 'security', title: 'Security Guard', place: null, salary: 85000, req: { level: 'none', minAge: 18 }, levels: ['Gateman', 'Security Supervisor'] },
    { id: 'border-trader', title: 'Cross-Border Trader', place: 'idiroko-border', salary: 200000, req: { level: 'none', minAge: 18 }, levels: ['Small Trader', 'Big Trader', 'Import Merchant'], risk: 2 },
    // Skilled trades
    { id: 'tailor', title: 'Tailor / Fashion Designer', place: null, salary: 140000, req: { level: 'none', minAge: 16, skill: 'tailoring' }, levels: ['Tailor', 'Fashion Designer', 'Fashion House CEO'] },
    { id: 'mechanic', title: 'Auto Mechanic', place: null, salary: 150000, req: { level: 'none', minAge: 16, skill: 'mechanic' }, levels: ['Mechanic', 'Workshop Owner'] },
    { id: 'barber', title: 'Barber / Hairstylist', place: null, salary: 130000, req: { level: 'none', minAge: 16, skill: 'hair' }, levels: ['Stylist', 'Salon Owner'] },
    { id: 'electrician', title: 'Electrician', place: null, salary: 160000, req: { level: 'none', minAge: 17, skill: 'electrical' }, levels: ['Electrician', 'Contractor'] },
    // SSCE
    { id: 'factory', title: 'Factory Worker', place: 'agbara-estate', salary: 110000, req: { level: 'SSCE', minAge: 18 }, levels: ['Factory Hand', 'Machine Operator', 'Shift Supervisor'] },
    { id: 'cement-op', title: 'Plant Operator', place: 'lafarge', salary: 160000, req: { level: 'SSCE', minAge: 18 }, levels: ['Plant Operator', 'Senior Operator', 'Plant Foreman'] },
    { id: 'clerk', title: 'Civil Service Clerk', place: 'oke-mosan', salary: 85000, req: { level: 'SSCE', minAge: 18 }, levels: ['Clerical Officer', 'Executive Officer', 'Chief Executive Officer'] },
    { id: 'airport-staff', title: 'Airport Ground Staff', place: 'gateway-airport', salary: 180000, req: { level: 'SSCE', minAge: 18 }, levels: ['Ground Staff', 'Ramp Supervisor'] },
    // Diploma / NCE
    { id: 'primary-teacher', title: 'Primary School Teacher', place: null, salary: 95000, req: { level: 'NCE', fields: ['teaching'] }, levels: ['Teacher II', 'Teacher I', 'Head Teacher'] },
    { id: 'lab-tech', title: 'Lab Technician', place: 'fmc', salary: 140000, req: { level: 'ND', fields: ['science', 'health'] }, levels: ['Lab Technician', 'Senior Lab Technician'] },
    { id: 'chew-job', title: 'Community Health Worker', place: 'gh-ijebu', salary: 120000, req: { level: 'ND', fields: ['health'] }, levels: ['CHEW', 'Senior CHEW', 'Chief CHEW'] },
    { id: 'it-support', title: 'IT Support Officer', place: 'ota-industrial', salary: 160000, req: { level: 'ND', fields: ['tech'] }, levels: ['IT Support', 'Systems Admin', 'IT Manager'] },
    { id: 'bookkeeper', title: 'Bookkeeper', place: 'sagamu-industrial', salary: 130000, req: { level: 'ND', fields: ['finance', 'business'] }, levels: ['Bookkeeper', 'Accounts Officer'] },
    { id: 'reporter', title: 'Radio Reporter', place: 'oke-mosan', salary: 130000, req: { level: 'ND', fields: ['media'] }, levels: ['Reporter', 'Presenter', 'Station Manager'] },
    { id: 'electrical-tech', title: 'Electrical Technician', place: 'ibese-cement', salary: 200000, req: { level: 'ND', fields: ['engineering'] }, levels: ['Technician', 'Senior Technician'] },
    // Degree (+ NYSC)
    { id: 'sec-teacher', title: 'Secondary School Teacher', place: null, salary: 130000, req: { level: 'BSc', fields: ['teaching', 'science', 'finance', 'tech'], nysc: true }, levels: ['Teacher', 'HOD', 'Vice Principal', 'Principal'] },
    { id: 'admin-officer', title: 'Administrative Officer', place: 'oke-mosan', salary: 150000, req: { level: 'BSc', nysc: true }, levels: ['Admin Officer II', 'Senior Admin Officer', 'Director', 'Permanent Secretary'] },
    { id: 'banker', title: 'Bank Officer', place: 'kuto', salary: 280000, req: { level: 'BSc', fields: ['finance', 'business', 'tech'], nysc: true, minSmarts: 45 }, levels: ['Graduate Trainee', 'Banking Officer', 'Branch Manager', 'Regional Manager'] },
    { id: 'accountant', title: 'Accountant', place: 'sagamu-industrial', salary: 380000, req: { level: 'BSc', fields: ['finance'], nysc: true, minSmarts: 50 }, levels: ['Accountant', 'Senior Accountant', 'Finance Manager', 'CFO'] },
    { id: 'software-dev', title: 'Software Developer', place: 'abk-tech-hub', salary: 450000, req: { level: 'ND', fields: ['tech'], minSmarts: 55 }, levels: ['Junior Developer', 'Developer', 'Senior Developer', 'CTO'] },
    { id: 'engineer', title: 'Plant Engineer', place: 'ibese-cement', salary: 500000, req: { level: 'BSc', fields: ['engineering'], nysc: true, minSmarts: 55 }, levels: ['Graduate Engineer', 'Engineer', 'Senior Engineer', 'Plant Manager'] },
    { id: 'journalist', title: 'Journalist', place: 'oke-mosan', salary: 200000, req: { level: 'BSc', fields: ['media'], nysc: true }, levels: ['Reporter', 'Correspondent', 'Editor'] },
    { id: 'agric-officer', title: 'Agric Extension Officer', place: 'odeda-farms', salary: 180000, req: { level: 'BSc', fields: ['agric'], nysc: true }, levels: ['Extension Officer', 'Senior Officer', 'Agribusiness Owner'] },
    { id: 'nurse', title: 'Nurse', place: 'oouth', salary: 300000, req: { level: 'BSc', fields: ['nursing'], nysc: true }, levels: ['Nursing Officer II', 'Nursing Officer I', 'Matron', 'Director of Nursing'] },
    { id: 'pharmacist', title: 'Pharmacist', place: 'fmc', salary: 400000, req: { level: 'BSc', fields: ['pharmacy'], nysc: true }, levels: ['Pharmacist', 'Senior Pharmacist', 'Pharmacy Owner'] },
    { id: 'doctor', title: 'Medical Doctor', place: 'fmc', salary: 650000, req: { level: 'BSc', fields: ['medicine'], nysc: true }, levels: ['House Officer', 'Medical Officer', 'Registrar', 'Consultant'] },
    { id: 'vet', title: 'Veterinary Doctor', place: 'odeda-farms', salary: 380000, req: { level: 'BSc', fields: ['vetmed'], nysc: true }, levels: ['Vet Officer', 'Senior Vet', 'Clinic Owner'] },
    { id: 'lawyer', title: 'Lawyer', place: 'oke-mosan', salary: 300000, req: { level: 'BSc', fields: ['law'], nysc: true, skill: 'lawschool' }, levels: ['Associate', 'Senior Associate', 'Partner', 'SAN'] },
    { id: 'lecturer', title: 'University Lecturer', place: null, institution: true, salary: 450000, req: { level: 'MSc', minSmarts: 60 }, levels: ['Assistant Lecturer', 'Lecturer II', 'Senior Lecturer', 'Professor'] },
  ];

  const SKILLS = [
    { id: 'tailoring', name: 'Tailoring apprenticeship', cost: 150000, years: 1 },
    { id: 'mechanic', name: 'Auto mechanic apprenticeship', cost: 120000, years: 1 },
    { id: 'hair', name: 'Barbing & hairdressing', cost: 100000, years: 1 },
    { id: 'electrical', name: 'Electrical installation', cost: 130000, years: 1 },
    { id: 'adire', name: 'Adire tie-and-dye (Itoku)', cost: 80000, years: 1 },
    { id: 'coding', name: 'Coding bootcamp', cost: 450000, years: 1, smarts: 6 },
    { id: 'lawschool', name: 'Nigerian Law School (call to bar)', cost: 1200000, years: 1, requires: { field: 'law' } },
  ];

  const ASSETS = [
    { id: 'phone-tecno', name: 'Tecno phone', price: 220000, kind: 'phone', depreciation: 0.3, happiness: 5 },
    { id: 'phone-iphone', name: 'iPhone (UK-used)', price: 1300000, kind: 'phone', depreciation: 0.25, happiness: 10, looks: 2 },
    { id: 'generator', name: '"I better pass my neighbour" generator', price: 280000, kind: 'generator', depreciation: 0.2, happiness: 4 },
    { id: 'solar', name: 'Solar inverter system', price: 2500000, kind: 'generator', depreciation: 0.08, happiness: 8 },
    { id: 'motorbike', name: 'Motorbike (Bajaj)', price: 1300000, kind: 'motorbike', depreciation: 0.15, happiness: 3 },
    { id: 'keke', name: 'Keke NAPEP', price: 3800000, kind: 'keke', depreciation: 0.12, happiness: 3 },
    { id: 'car-corolla', name: 'Toyota Corolla (tokunbo)', price: 11000000, kind: 'car', depreciation: 0.1, happiness: 12, looks: 3 },
    { id: 'car-venza', name: 'Toyota Venza', price: 22000000, kind: 'car', depreciation: 0.1, happiness: 15, looks: 5 },
    { id: 'land-mowe', name: 'Plot of land, Mowe', price: 6000000, kind: 'land', appreciation: 0.15, happiness: 5 },
    { id: 'land-abk', name: 'Plot of land, Abeokuta (Kobape)', price: 3500000, kind: 'land', appreciation: 0.12, happiness: 5 },
    { id: 'house-ifo', name: '3-bedroom bungalow, Ifo', price: 30000000, kind: 'house', appreciation: 0.1, happiness: 20, rentIncome: 1200000 },
    { id: 'house-abk', name: '4-bedroom duplex, Abeokuta GRA', price: 75000000, kind: 'house', appreciation: 0.1, happiness: 30, rentIncome: 3000000 },
  ];

  const NAMES = {
    male: ['Adebayo', 'Olumide', 'Tunde', 'Segun', 'Femi', 'Kunle', 'Babatunde', 'Damilola', 'Oluwaseun', 'Ayodeji', 'Gbenga', 'Kayode', 'Ibrahim', 'Abdulrasheed', 'Tobi', 'Wale', 'Dapo', 'Lekan', 'Biodun', 'Sola', 'Emeka', 'Chinedu', 'Toheeb', 'Ridwan', 'Opeyemi'],
    female: ['Funmilayo', 'Adunni', 'Bisola', 'Titilayo', 'Folake', 'Yetunde', 'Kemi', 'Bukola', 'Damilola', 'Omolara', 'Aisha', 'Simisola', 'Temitope', 'Ronke', 'Morenike', 'Abosede', 'Iyabo', 'Mariam', 'Ifeoluwa', 'Ngozi', 'Toyin', 'Fisayo', 'Halimat', 'Remilekun', 'Oluwakemi'],
    surname: ['Adeyemi', 'Ogunleye', 'Soyinka', 'Kuti', 'Onabanjo', 'Odusanya', 'Sodipo', 'Ogunbiyi', 'Adebanjo', 'Oduntan', 'Bakare', 'Sowunmi', 'Okeowo', 'Adewale', 'Akinwale', 'Osinbajo', 'Abiola', 'Shonibare', 'Somoye', 'Lawal', 'Adekoya', 'Oyekan', 'Ogunsanya', 'Odubanjo', 'Fashola'],
  };

  const NIGERIAN_STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];

  // Transport modes: cost per km (₦), danger = chance of mishap per 100 km.
  const TRANSPORT = {
    bus: { name: 'Danfo / bus', perKm: 70, danger: 0.4 },
    keke: { name: 'Keke', perKm: 160, danger: 0.6, maxKm: 25 },
    okada: { name: 'Okada', perKm: 280, danger: 1.5, maxKm: 40 },
    car: { name: 'Own car (fuel)', perKm: 110, danger: 0.2, needsAsset: 'car' },
    ride: { name: 'Ride-hailing', perKm: 450, danger: 0.1 },
  };

  return {
    OGUN_CENTER, OGUN_BOUNDS, LGAS, TOWNS, COURSES, LEVEL_RANK, INSTITUTIONS,
    SECONDARY, PLACES, JOBS, SKILLS, ASSETS, NAMES, NIGERIAN_STATES, TRANSPORT,
    CRIMES, OFFICES, PARTIES,
  };
});
