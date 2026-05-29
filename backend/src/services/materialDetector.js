// ══════════════════════════════════════════════════════════════════════════════
// MATERIAL GROUP DETECTOR
// Auto-detect MaterialGroup và MaterialSubGroup từ itemCode
// I-095 dùng: I95-VTC01-001, I90-B-044, A.01, A01 ...
// I-090 dùng: I90-A1, I90-C44 ...
// Pattern: ký tự đầu A→G map sang VTC→VTP
// ══════════════════════════════════════════════════════════════════════════════

const LETTER_TO_GROUP = {
  A: 'VTC',
  B: 'VPK',
  C: 'VDK',
  D: 'VBP',
  E: 'VTH',
  F: 'VTS',
  G: 'VTP',
};

const GROUP_SUBGROUP_MAP = {
  VTC: ['VTC01', 'VTC02', 'VTC03', 'VTC04'],
  VPK: ['VPK01', 'VPK02'],
  VDK: ['VDK01', 'VDK02', 'VDK03'],
  VBP: ['VBP01', 'VBP02'],
  VTH: ['VTH01', 'VTH02', 'VTH03'],
  VTS: ['VTS01', 'VTS02'],
  VTP: ['VTP01'],
};

/**
 * Detect materialGroupCode và materialSubGroupCode từ itemCode
 * @returns {{ materialGroupCode: string|null, materialSubGroupCode: string|null }}
 */
function detectMaterialGroup(itemCode) {
  if (!itemCode) return { materialGroupCode: null, materialSubGroupCode: null };
  const code = String(itemCode).toUpperCase().trim();

  // Pattern 1: Direct sub-group code (VD: "VTC01-001", "I95-VTC02-007")
  for (const [groupCode, subCodes] of Object.entries(GROUP_SUBGROUP_MAP)) {
    for (const subCode of subCodes) {
      if (code.includes(subCode)) {
        return { materialGroupCode: groupCode, materialSubGroupCode: subCode };
      }
    }
    // Group code itself (VD: "VTC-001")
    if (code.includes(groupCode)) {
      return { materialGroupCode: groupCode, materialSubGroupCode: subCodes[0] };
    }
  }

  // Pattern 2: Letter prefix A-G (VD: "I90-A1", "A.01", "B-044", "C44")
  const letterMatch = code.match(/[^A-Z]([A-G])[._-]?\d/);
  if (letterMatch) {
    const letter = letterMatch[1];
    const groupCode = LETTER_TO_GROUP[letter];
    if (groupCode) {
      return {
        materialGroupCode: groupCode,
        materialSubGroupCode: GROUP_SUBGROUP_MAP[groupCode][0],
      };
    }
  }

  // Pattern 3: Starts with letter A-G directly
  const startMatch = code.match(/^([A-G])[._-]?\d/);
  if (startMatch) {
    const letter = startMatch[1];
    const groupCode = LETTER_TO_GROUP[letter];
    if (groupCode) {
      return {
        materialGroupCode: groupCode,
        materialSubGroupCode: GROUP_SUBGROUP_MAP[groupCode][0],
      };
    }
  }

  return { materialGroupCode: null, materialSubGroupCode: null };
}

module.exports = {
  detectMaterialGroup,
  LETTER_TO_GROUP,
  GROUP_SUBGROUP_MAP,
};
