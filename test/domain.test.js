import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDomain } from '../src/domain.js';

async function loadDomain() {
  const raw = await readFile(new URL('../fixtures/domain.json', import.meta.url), 'utf8');
  return parseDomain(raw);
}

test('样例领域资料完整', async () => {
  const value = await loadDomain();
  assert.equal(value.domain, 'modular-house');
  assert.ok(value.entities.length >= 3);
  assert.ok(value.rules.length >= 3);
});

test('领域对象覆盖同一项目下的交付链', async () => {
  const value = await loadDomain();
  const required = [
    '项目', '短视频询盘', '客户需求', '确认配置', '报价',
    '设计版本', '国家适配版本', '部件来源', '检测证书',
    '生产模块', '生产节点', '容量锁定', '装箱单元', '装运批次',
    '清关材料', '交接记录', '海外服务站', '安装验收', '客户视图',
  ];
  for (const name of required) {
    assert.ok(value.entities.includes(name), `缺少领域对象：${name}`);
  }
});

test('规则覆盖协会要求的关键约束', async () => {
  const value = await loadDomain();
  const checkpoints = ['独立合规版本', '双方确认', '原设计', '箱号', '数量守恒', '追加交接', '尚未确认', '负责范围'];
  for (const key of checkpoints) {
    assert.ok(value.rules.some((rule) => rule.includes(key)), `缺少规则要点：${key}`);
  }
});

test('样例可回答箱号追溯并保持数量守恒', async () => {
  const { sample } = await loadDomain();
  assert.ok(sample.project_id, '样例缺少项目标识');
  assert.ok(sample.box_no, '样例缺少箱号');
  assert.ok(sample.layout_version, '箱号未关联户型版本');
  assert.ok(sample.certificates.length >= 2, '箱号未关联防火与抗震检测证书');
  assert.ok(sample.manufacturer, '箱号未关联生产企业');
  assert.ok(sample.service_contact, '箱号未关联缺件联系人');
  const shipped = sample.shipments.reduce((sum, batch) => sum + batch.boxes, 0);
  assert.equal(shipped, sample.capacity_lock.locked_boxes, '分批装运总数须等于容量锁定数');
  const seqs = sample.handovers.map((handover) => handover.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), '交接记录序号须递增追加');
});

test('读取模块拒绝空白或重复条目', () => {
  const base = { domain: 'modular-house', version: 2, facts: ['事实'], entities: ['装箱单元'], rules: ['规则'], sample: {} };
  assert.throws(() => parseDomain(JSON.stringify({ ...base, entities: ['装箱单元', '装箱单元'] })), /重复/);
  assert.throws(() => parseDomain(JSON.stringify({ ...base, rules: [''] })), /空白/);
});
