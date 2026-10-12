import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import Login from '../pages/Login';
import AIHub, { fieldsByTool, TOOL_PRESETS } from '../pages/AIHub';
import AIReport from '../components/AIReport';
import AIWorkspace, { workspaceFields, workspacePresets } from '../components/AIWorkspace';
import { fillNativeFields } from '../components/NativeAIControls';

jest.mock('axios', () => {
  const demoGet = jest.fn(() => Promise.resolve({ data: { email: 'demo.fixture@example.test', password: 'fixture-password' } }));
  return {
    create: () => ({
      get: demoGet,
      post: jest.fn(() => Promise.resolve({ data: {} })),
    }),
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    __demoGet: demoGet,
  };
});

global.IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const click = async (element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  axios.__demoGet.mockResolvedValue({ data: { email: 'demo.fixture@example.test', password: 'fixture-password' } });
});

test('all AI Hub presets cover every required and optional field and the actual buttons fill them', async () => {
  Object.entries(fieldsByTool).forEach(([tool, fields]) => {
    expect(TOOL_PRESETS[tool]).toHaveLength(3);
    TOOL_PRESETS[tool].forEach((preset) => {
      expect(Object.keys(preset).sort()).toEqual(fields.map((field) => field.key).sort());
      fields.forEach((field) => expect(String(preset[field.key]).trim()).not.toBe(''));
    });
  });

  localStorage.setItem('token', 'fixture-token');
  const view = mount(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AIHub /></MemoryRouter>);
  const cardTitle = Array.from(view.container.querySelectorAll('h3')).find((node) => node.textContent === 'Insurance Pre-Auth');
  await click(cardTitle.parentElement);

  const presetButtons = Array.from(view.container.querySelectorAll('.native-ai-control-buttons button'));
  expect(presetButtons.map((button) => button.textContent)).toEqual([
    'Demo AI · Acute chest CT',
    'Demo AI · Neuro follow-up',
    'Demo AI · Routine screening',
  ]);
  for (const button of presetButtons) {
    await click(button);
    const fields = Array.from(view.container.querySelectorAll('[data-ai-field]'));
    expect(fields).toHaveLength(fieldsByTool['insurance-preauth'].length);
    fields.forEach((field) => expect(String(field.value).trim()).not.toBe(''));
  }
  view.unmount();
});

test('generic prompt presets fill all visible required and optional fields', () => {
  const scope = document.createElement('form');
  scope.innerHTML = `
    <label>Findings <textarea data-ai-field="findings"></textarea></label>
    <label>Modality <select data-ai-field="modality"><option value="">Any</option><option value="CT">CT</option><option value="MRI">MRI</option></select></label>
    <label>Body part <input data-ai-field="body_part"></label>
    <label>Optional context <input data-ai-field="context"></label>
  `;
  document.body.appendChild(scope);
  for (let variant = 0; variant < 3; variant += 1) {
    const result = fillNativeFields(scope, variant, 'similar-study search');
    expect(result).toEqual({ filled: 4, manual: [] });
    Array.from(scope.elements).forEach((field) => expect(String(field.value).trim()).not.toBe(''));
  }
  scope.remove();
});

test('returned JSON and saved JSON use the same labeled cards, lists, and table renderer', () => {
  const structured = {
    executive_summary: 'Prioritize the urgent review.',
    facts: { confidence: 0.91, requires_review: true },
    actions: [
      { action: 'Validate source', owner: 'Radiologist', status: 'Open' },
      { action: 'Document decision', owner: 'Reviewer', status: 'Pending' },
    ],
    risks: ['Missing comparison study', 'Unverified measurement'],
  };
  const current = mount(<AIReport response={structured} title="Returned result" />);
  expect(current.container.textContent).toContain('Executive summary');
  expect(current.container.querySelectorAll('.ai-report-facts > div')).toHaveLength(2);
  expect(current.container.querySelectorAll('.ai-report-table tbody tr')).toHaveLength(2);
  expect(current.container.querySelectorAll('ul li')).toHaveLength(2);
  expect(current.container.querySelector('pre')).toBeNull();
  current.unmount();

  const saved = mount(<AIReport response={{ id: 42, result: JSON.stringify(structured), result_json: structured, input: { goal: 'fixture' } }} title="Saved result" />);
  expect(saved.container.textContent).toContain('Executive summary');
  expect(saved.container.querySelectorAll('.ai-report-facts > div')).toHaveLength(2);
  expect(saved.container.querySelectorAll('.ai-report-table tbody tr')).toHaveLength(2);
  expect(saved.container.querySelectorAll('ul li')).toHaveLength(2);
  expect(saved.container.querySelector('pre')).toBeNull();
  saved.unmount();
});

test('workspace buttons fill all ten fields and saved history uses the report renderer', async () => {
  const feature = {
    id: 'fixture-feature',
    title: 'Fixture report',
    description: 'Fixture provider verification.',
    samples: [{ label: 'A', value: 'Scenario input' }, { label: 'B', value: 'Data input' }, { label: 'C', value: 'Executive input' }],
  };
  const presets = workspacePresets(feature);
  expect(presets).toHaveLength(3);
  presets.forEach((preset) => {
    expect(Object.keys(preset.values).sort()).toEqual(workspaceFields.map((field) => field.key).sort());
    workspaceFields.forEach((field) => expect(String(preset.values[field.key]).trim()).not.toBe(''));
  });

  const item = {
    id: 77,
    input: presets[0].values,
    result: '{"summary":"Saved fixture"}',
    result_json: { summary: 'Saved fixture', actions: [{ action: 'Review', owner: 'Owner' }] },
    model: 'fixture/model',
    usage: { total_tokens: 12 },
    created_at: '2026-10-10T12:00:00.000Z',
  };
  global.fetch = jest.fn(async (_url, options = {}) => ({
    ok: true,
    json: async () => options.method === 'POST' ? { item } : { items: [item] },
  }));

  const view = mount(<AIWorkspace feature={feature} token="fixture-token" />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const buttons = Array.from(view.container.querySelectorAll('.ai-preset-bar button'));
  expect(buttons).toHaveLength(3);
  for (const button of buttons) {
    await click(button);
    const controls = Array.from(view.container.querySelectorAll('.ai-form-grid input, .ai-form-grid textarea, .ai-form-grid select'));
    expect(controls).toHaveLength(10);
    controls.forEach((control) => expect(String(control.value).trim()).not.toBe(''));
  }

  const savedRow = Array.from(view.container.querySelectorAll('.ai-history-row')).find((row) => row.textContent.includes('Open report'));
  await click(savedRow);
  const dialog = document.body.querySelector('.ai-workspace-modal');
  expect(dialog.textContent).toContain('Saved fixture');
  expect(dialog.querySelectorAll('.ai-report-table tbody tr')).toHaveLength(1);
  view.unmount();
});

test('Fill Demo Credentials button fills both login fields from the gated demo endpoint', async () => {
  const view = mount(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Login /></MemoryRouter>);
  const button = Array.from(view.container.querySelectorAll('button')).find((node) => node.textContent === 'Fill Demo Credentials');
  expect(button).toBeTruthy();
  await click(button);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  expect(axios.__demoGet).toHaveBeenCalledWith('/api/auth/demo-credentials');
  expect(view.container.querySelector('.login-error')?.textContent || '').toBe('');
  expect(view.container.querySelector('input[type="email"]').value).toBe('demo.fixture@example.test');
  expect(view.container.querySelector('input[type="password"]').value).toBe('fixture-password');
  view.unmount();
});
