// Every Airtable ID the app uses. The app only ever reads from this base.
export const BASE_ID = 'appmhefV6jugAxROJ'; // LH Equipment

export const EQUIPMENT = {
  table: 'tblHqR9T4pGezce4B', // Equipment Info
  fields: {
    id: 'fldCK3EBHrOrlrqfU', // EquipmentID
    location: 'flduZshwr22R9gIjX',
    status: 'fldd4ONpETk0OYN2J',
    notes: 'fldfL9uBe45HAES6y',
    make: 'fldsPSU1dU3k71uC1',
    model: 'fldffYif52GzuGrPn',
    type: 'fld3bxJBs8vzWDzeb',
    serial: 'fld2eLDaWRFN0ElcN',
    weight: 'fldDoSHrogj8qrQh2',
    files: 'fldSDRzR86yN0a6Kc', // Attachment
    filter: 'fldC92uoJMgKpzhvY',
    dealer: 'fldobGwlFncbLFxCz',
    tooth: 'fldzUncubgIujUC1K',
    year: 'fldBalB3FxmfXldMS',
    tracking: 'fldkPYyhbkHJl2Uoq', // TRACKING checkbox: only ticked machines show in the app
  },
};

export const OLD_EQUIPMENT = {
  table: 'tblISywv1c9nr1PUU', // Old Equipment
  fields: {
    id: 'fldDcK1dEehAdg15d',
    location: 'fldvr9E8oPv015j9g',
    status: 'fldewva1BGN9GNoS2',
    notes: 'fldgdQRdbRyQsttWR',
    make: 'fldthzhDaHwtZQ5sk',
    model: 'fldgHFFR2P9Imv2FG',
    type: 'fld4De6dpVYIOsa4u',
    serial: 'fld3Gs0MTE8WStW26',
    weight: 'fldEQz43l3Mhigr7l',
    files: 'fldT5yWt5T1WSZHAv',
  },
};

export const MOVES = {
  table: 'tblSSILxWVOVyA7x8', // Moves
  fields: {
    equipment: 'fldB3iVYkWTTqdBGW',
    status: 'fldzBUAUV2RiqmZ2l',
    date: 'fldwdYVmJ17nkMtaX',
    from: 'fldC8rfGuW9zKimMg',
    to: 'fld5sBF2dIP6v6j3T',
    truck: 'fldROaNKqoZWfvXnA',
    permit: 'fldnb5GeWg5ALUPRK',
    driver: 'fldMpx7GiYjf72Wr6',
    enteredBy: 'fldHzQSnI1KcnivLG',
    type: 'flddYHzVGV12nQxHV', // Moves has its own Type list
  },
};

// Locations and statuses that mean a piece has left the fleet.
// These pieces are left off Jobsites and hidden in Fleet unless asked for.
export const OUT_OF_FLEET_LOCATIONS = ['Auction', 'Scrap', 'HB Shop - TRASH', 'Trade In'];
export const OUT_OF_FLEET_STATUSES = ['Sold/Trade'];

// How old the saved copy of Airtable can get before a refresh starts.
export const REFRESH_AFTER_MIN = 15;
// Airtable attachment links stop working after about 2 hours.
export const FILE_LINKS_GOOD_FOR_MIN = 90;
export const SESSION_DAYS = 60;

// Every change made in the app is written here.
export const CHANGE_LOG = {
  table: 'tbl00wX3WN9nMjgZQ',
  fields: {
    equipment: 'fldV0eMurA390mECO', when: 'fldIMtvF8gY9okxaE', who: 'fldLrqLg6Ydv3WCNS',
    change: 'fldWYpOM7dkRjmdVU', from: 'fldMa5j1jj4SckEDV', to: 'fldU18dW5HwnLXl3n', record: 'fldU6ezxbpCp9SZoS',
  },
};

// Machine fields the office can edit, by the short names the page uses.
export const EDITABLE = {
  loc: 'location', st: 'status', ty: 'type', mk: 'make', md: 'model', yr: 'year', sn: 'serial',
  wt: 'weight', dl: 'dealer', flt: 'filter', tooth: 'tooth', nt: 'notes', tk: 'tracking',
};
export const UNDO_MINUTES = 5;

// The Moves table's own Type list. A new move gets the machine's Type when it's on this list.
export const MOVE_TYPES = ['Dozer', 'Rubber Tire Loader', 'Skid Loader', 'Backhoe', 'Excavator', 'Track Loader', 'Roller',
  'Articulating Truck', 'Tractor', 'Scraper', 'Attachment', 'Slinger', 'Trench Box', 'Stone Box', 'Zipper',
  'Manhole Box', 'Steel Plate', 'Sweeper', 'Broom', 'Paver'];
export const MOVE_TYPE_MAP = { Bucket: 'Buckets', 'Plow Disk': 'disc' };
