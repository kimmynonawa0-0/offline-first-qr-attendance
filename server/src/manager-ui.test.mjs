import test from 'node:test';
import assert from 'node:assert/strict';
import { sectionInfo } from '../manager/section-info.mjs';

test('manager student filters derive program and year from section names', () => {
  assert.deepEqual(sectionInfo('BSCS-3C'), { program: 'BSCS', year: '3' });
  assert.deepEqual(sectionInfo('BSIT 2A'), { program: 'BSIT', year: '2' });
  assert.deepEqual(sectionInfo(''), { program: 'Other', year: 'Other' });
  assert.deepEqual(sectionInfo('Special Section'), { program: 'Other', year: 'Other' });
});
