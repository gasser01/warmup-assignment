const fs = require("fs");

/*******************************************************
 ***********************  HELBER  ***********************
 *******************************************************/

const headers = [
    "DriverID",
    "DriverName",
    "Date",
    "StartTime",
    "EndTime",
    "ShiftDuration",
    "IdleTime",
    "ActiveTime",
    "MetQuota",
    "HasBonus"
];

class driver{
    constructor(data) {
        this.data = data;
    }
    
    get driverID() { return this.data.DriverID; }
    get driverName() { return this.data.DriverName; }
    get date() { return this.data.Date; }
    get startTime() { return this.data.StartTime; }
    get endTime() { return this.data.EndTime; }
    get shiftDuration() { return this.data.ShiftDuration; }
    get idleTime() { return this.data.IdleTime; }
    get activeTime() { return this.data.ActiveTime; }
    get metQuota() { return this.data.MetQuota === "true"; }
    get hasBonus() { return this.data.HasBonus === "true"; }

}
function to24Hours(time12) {
    const [timePart, modifierRaw] = time12.trim().split(" ");
    const modifier = modifierRaw.toLowerCase();
    let [hours, minutes, seconds] = timePart.split(":").map(Number);

    if (modifier === "pm" && hours !== 12) hours += 12;
    if (modifier === "am" && hours === 12) hours = 0;

    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function time12ToSeconds(time12) {
    const time24 = to24Hours(time12);
    const [hours, minutes, seconds] = time24.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}

function durationToSeconds(duration) {
    const [hours, minutes, seconds] = duration.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}

function secondsToDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const pad = (n) => String(n).padStart(2, "0");
    return `${h}:${pad(m)}:${pad(s)}`;
}

// before:
// function validateDriver(textFile, driverObj) { ... }

function validateShift(textFile, driverObj) {
  const data = fs.readFileSync(textFile, "utf-8");
  const lines = data.trim().split("\n");

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const fileDriverID = values[0];
    const fileDate = values[2];

    if (fileDriverID === driverObj.driverID && fileDate === driverObj.date) {
      return true;
    }
  }
  return false;
}

function objectToCsvLine(obj) {
    const values = [
        obj.driverID,
        obj.driverName,
        obj.date,
        obj.startTime,
        obj.endTime,
        obj.shiftDuration,
        obj.idleTime,
        obj.activeTime,
        String(obj.metQuota),
        String(obj.hasBonus)
    ];
    return values.join(",");
}

function isEidDate(date) {
    const [y, m, d] = date.split("-").map(Number);
    return y === 2025 && m === 4 && d >= 10 && d <= 30;
}

function dayOfWeekName(date) {
    const [y, m, d] = date.split("-").map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d));
    const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return names[utc.getUTCDay()];
}


/*******************************************************
 *********************  FUNCTIONS  *********************
 ************************************************/





// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================

function getShiftDuration(startTime, endTime) {
    let startSeconds = time12ToSeconds(startTime);
    let endSeconds = time12ToSeconds(endTime);
    if (endSeconds < startSeconds) endSeconds += 24 * 3600;
    return secondsToDuration(endSeconds - startSeconds);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    let startSeconds = time12ToSeconds(startTime);
    let endSeconds = time12ToSeconds(endTime);
    if (endSeconds < startSeconds) endSeconds += 24 * 3600;

    const shiftDuration = endSeconds - startSeconds;
    const windowStart = 8 * 3600;
    const windowEnd = 22 * 3600;

    const overlap = (aStart, aEnd, bStart, bEnd) => {
        const start = Math.max(aStart, bStart);
        const end = Math.min(aEnd, bEnd);
        return Math.max(0, end - start);
    };

    let activeSeconds = 0;
    const maxDayOffset = Math.floor(endSeconds / (24 * 3600));
    for (let day = 0; day <= maxDayOffset; day++) {
        const offset = day * 24 * 3600;
        activeSeconds += overlap(startSeconds, endSeconds, windowStart + offset, windowEnd + offset);
    }

    const idleSeconds = Math.max(0, shiftDuration - activeSeconds);
    return secondsToDuration(idleSeconds);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const total = durationToSeconds(shiftDuration);
    const idle = durationToSeconds(idleTime);
    return secondsToDuration(total - idle);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    const dailyMinimumSeconds = 8 * 3600 + 24 * 60;
    const eidMinimumSeconds = 6 * 3600;
    const activeSeconds = durationToSeconds(activeTime);

    if (isEidDate(date)) {
        return activeSeconds >= eidMinimumSeconds;
    }
    return activeSeconds >= dailyMinimumSeconds;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    if (validateShift(textFile, shiftObj)) {
    console.log("Shift already exists");
    return {};
  }

    const record = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration: getShiftDuration(shiftObj.startTime, shiftObj.endTime),
        idleTime: getIdleTime(shiftObj.startTime, shiftObj.endTime)
    };
    record.activeTime = getActiveTime(record.shiftDuration, record.idleTime);
    record.metQuota = metQuota(record.date, record.activeTime);
    record.hasBonus = false;

    const line = objectToCsvLine(record);
    const raw = fs.readFileSync(textFile, "utf-8");
    const lines = raw.trimEnd().split("\n");
    const header = lines[0] || headers.join(",");
    const dataLines = lines.slice(1).filter(l => l.trim() !== "");

    const compare = (aDriverID, aDate, bDriverID, bDate) => {
        if (aDriverID < bDriverID) return -1;
        if (aDriverID > bDriverID) return 1;
        if (aDate < bDate) return -1;
        if (aDate > bDate) return 1;
        return 0;
    };

    let inserted = false;
    const newData = [];
    for (const l of dataLines) {
        const cols = l.split(",");
        const cmp = compare(record.driverID, record.date, cols[0], cols[2]);
        if (!inserted && cmp < 0) {
            newData.push(line);
            inserted = true;
        }
        newData.push(l);
    }
    if (!inserted) newData.push(line);

    fs.writeFileSync(textFile, [header, ...newData].join("\n") + "\n", "utf-8");

    console.log("Shift record added:", line);
    return record;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    const lines = fs.readFileSync(textFile, "utf-8").split("\n");

    for (let i = 1; i < lines.length; i++) { 
        const cols = lines[i].split(",");

        if (cols[0] === driverID && cols[2] === date) {
            cols[9] = String(newValue); 
            lines[i] = cols.join(",");
            break;
        }
    }

    fs.writeFileSync(textFile, lines.join("\n"), "utf-8");
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const targetMonth = Number(month);
    const lines = fs.readFileSync(textFile, "utf-8").trimEnd().split("\n");
    let found = false;
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 10) continue;
        if (cols[0] !== driverID) continue;
        found = true;
        const recMonth = Number(cols[2].split("-")[1]);
        const hasBonus = cols[9].trim().toLowerCase() === "true";
        if (recMonth === targetMonth && hasBonus) count++;
    }

    return found ? count : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const targetMonth = Number(month);
    const lines = fs.readFileSync(textFile, "utf-8").trimEnd().split("\n");
    let totalSeconds = 0;

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 9) continue;
        if (cols[0] !== driverID) continue;
        const recMonth = Number(cols[2].split("-")[1]);
        if (recMonth !== targetMonth) continue;
        totalSeconds += durationToSeconds(cols[7]);
    }

    return secondsToDuration(totalSeconds);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const targetMonth = Number(month);
    const lines = fs.readFileSync(textFile, "utf-8").trimEnd().split("\n");

    let dayOff = null;
    const rateLines = fs.readFileSync(rateFile, "utf-8").trimEnd().split("\n");
    for (const line of rateLines) {
        const cols = line.split(",");
        if (cols[0] === driverID) {
            dayOff = cols[1];
            break;
        }
    }

    let requiredSeconds = 0;
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 3) continue;
        if (cols[0] !== driverID) continue;
        const date = cols[2];
        const recMonth = Number(date.split("-")[1]);
        if (recMonth !== targetMonth) continue;
        if (dayOff && dayOfWeekName(date) === dayOff) continue;

        requiredSeconds += isEidDate(date) ? 6 * 3600 : (8 * 3600 + 24 * 60);
    }

    const bonusSeconds = Math.max(0, Number(bonusCount)) * 2 * 3600;
    requiredSeconds = Math.max(0, requiredSeconds - bonusSeconds);
    return secondsToDuration(requiredSeconds);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
