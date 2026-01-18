const STORAGE_KEY = 'math:db-template';
const FALLBACK_SCHEMA = [];

const tableSearch = document.getElementById('tableSearch');
const newTableName = document.getElementById('newTableName');
const btnAddTable = document.getElementById('btnAddTable');
const tablesList = document.getElementById('tablesList');
const emptyState = document.getElementById('emptyState');
const tableEditor = document.getElementById('tableEditor');
const tableNameInput = document.getElementById('tableNameInput');
const btnAddColumn = document.getElementById('btnAddColumn');
const columnsList = document.getElementById('columnsList');
const btnSaveTemplate = document.getElementById('btnSaveTemplate');
const btnExportJson = document.getElementById('btnExportJson');
const jsonPreview = document.getElementById('jsonPreview');

let schema = [];
let activeTableId = null;
let hasLocalChanges = false;

const createId = () => `tbl_${Math.random().toString(36).slice(2, 9)}`;

const render = () => {
  renderTables();
  renderEditor();
  renderJson();
};

const renderTables = () => {
  const query = String(tableSearch?.value || '').trim().toLowerCase();
  tablesList.innerHTML = '';

  const filtered = schema.filter((table) => table.name.toLowerCase().includes(query));

  if (!filtered.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'لا توجد جداول مطابقة.';
    tablesList.appendChild(empty);
    return;
  }

  filtered.forEach((table) => {
    const item = document.createElement('li');
    item.className = `table-item ${table.id === activeTableId ? 'is-active' : ''}`;

    const title = document.createElement('span');
    title.textContent = table.name;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'حذف';
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      removeTable(table.id);
    });

    item.addEventListener('click', () => {
      activeTableId = table.id;
      render();
    });

    item.appendChild(title);
    item.appendChild(deleteBtn);
    tablesList.appendChild(item);
  });
};

const renderEditor = () => {
  const table = schema.find((entry) => entry.id === activeTableId);
  if (!table) {
    emptyState.classList.remove('hidden');
    tableEditor.classList.add('hidden');
    tableEditor.setAttribute('hidden', '');
    return;
  }

  emptyState.classList.add('hidden');
  tableEditor.classList.remove('hidden');
  tableEditor.removeAttribute('hidden');
  tableNameInput.value = table.name;

  columnsList.innerHTML = '';

  table.columns.forEach((column) => {
    const card = document.createElement('div');
    card.className = 'column-card';

    const grid = document.createElement('div');
    grid.className = 'column-grid';

    const nameField = createField('اسم العمود', column.name, (value) => {
      column.name = value;
      markChanges();
    });

    const typeField = createField('النوع', column.type, (value) => {
      column.type = value;
      markChanges();
    });

    const lengthField = createField('الطول الأقصى', column.maxLength || '', (value) => {
      column.maxLength = value;
      markChanges();
    });

    const nullableField = createSelectField('يسمح بالقيم الفارغة؟', column.nullable ? 'YES' : 'NO', (value) => {
      column.nullable = value === 'YES';
      markChanges();
    });

    grid.appendChild(nameField);
    grid.appendChild(typeField);
    grid.appendChild(lengthField);
    grid.appendChild(nullableField);

    const footer = document.createElement('div');
    footer.className = 'column-footer';
    footer.innerHTML = `<span>معرف العمود: ${column.id}</span>`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'إزالة العمود';
    removeBtn.addEventListener('click', () => {
      removeColumn(table.id, column.id);
    });

    footer.appendChild(removeBtn);
    card.appendChild(grid);
    card.appendChild(footer);
    columnsList.appendChild(card);
  });
};

const renderJson = () => {
  jsonPreview.textContent = JSON.stringify(schema, null, 2);
};

const createField = (labelText, value, onChange) => {
  const wrapper = document.createElement('div');
  const label = document.createElement('label');
  label.className = 'label';
  label.textContent = labelText;

  const input = document.createElement('input');
  input.className = 'input';
  input.type = 'text';
  input.value = value;
  input.addEventListener('input', (event) => {
    onChange(event.target.value.trim());
    renderTables();
    renderJson();
  });

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return wrapper;
};

const createSelectField = (labelText, value, onChange) => {
  const wrapper = document.createElement('div');
  const label = document.createElement('label');
  label.className = 'label';
  label.textContent = labelText;

  const select = document.createElement('select');
  select.className = 'input';
  ['NO', 'YES'].forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    option.selected = optionValue === value;
    select.appendChild(option);
  });

  select.addEventListener('change', (event) => {
    onChange(event.target.value);
    renderJson();
  });

  wrapper.appendChild(label);
  wrapper.appendChild(select);
  return wrapper;
};

const addTable = () => {
  const name = String(newTableName.value || '').trim();
  if (!name) {
    newTableName.focus();
    return;
  }

  schema.unshift({
    id: createId(),
    name,
    columns: [],
  });

  newTableName.value = '';
  activeTableId = schema[0].id;
  markChanges();
  render();
};

const removeTable = (tableId) => {
  schema = schema.filter((table) => table.id !== tableId);
  if (activeTableId === tableId) {
    activeTableId = schema[0]?.id || null;
  }
  markChanges();
  render();
};

const addColumn = () => {
  const table = schema.find((entry) => entry.id === activeTableId);
  if (!table) return;

  table.columns.push({
    id: createId(),
    name: 'عمود جديد',
    type: 'nvarchar',
    maxLength: '100',
    nullable: false,
  });

  markChanges();
  render();
};

const removeColumn = (tableId, columnId) => {
  const table = schema.find((entry) => entry.id === tableId);
  if (!table) return;
  table.columns = table.columns.filter((column) => column.id !== columnId);
  markChanges();
  render();
};

const markChanges = () => {
  hasLocalChanges = true;
};

const saveToLocal = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
  hasLocalChanges = false;
};

const copyJson = async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
    btnExportJson.textContent = 'تم النسخ';
    setTimeout(() => {
      btnExportJson.textContent = 'نسخ JSON';
    }, 1500);
  } catch (error) {
    btnExportJson.textContent = 'تعذر النسخ';
    setTimeout(() => {
      btnExportJson.textContent = 'نسخ JSON';
    }, 1500);
  }
};

const parseSchemaMarkdown = (markdown) => {
  const lines = markdown.split('\n');
  const tables = [];
  let currentTable = null;
  let parseRows = false;

  lines.forEach((line) => {
    if (line.startsWith('## ')) {
      if (currentTable) {
        tables.push(currentTable);
      }
      currentTable = {
        id: createId(),
        name: line.replace('## ', '').trim(),
        columns: [],
      };
      parseRows = false;
      return;
    }

    if (!currentTable) return;

    if (line.startsWith('| Column')) {
      parseRows = true;
      return;
    }

    if (parseRows && line.startsWith('| ---')) {
      return;
    }

    if (parseRows && line.startsWith('|')) {
      const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
      if (cells.length >= 4) {
        currentTable.columns.push({
          id: createId(),
          name: cells[0],
          type: cells[1],
          maxLength: cells[2],
          nullable: cells[3] === 'YES',
        });
      }
    }
  });

  if (currentTable) {
    tables.push(currentTable);
  }

  return tables;
};

const loadSchema = async () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      schema = JSON.parse(stored);
      activeTableId = schema[0]?.id || null;
      render();
      return;
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  try {
    const response = await fetch('/docs/database-schema.md');
    if (!response.ok) throw new Error('fetch failed');
    const markdown = await response.text();
    schema = parseSchemaMarkdown(markdown);
  } catch (error) {
    schema = FALLBACK_SCHEMA;
  }

  activeTableId = schema[0]?.id || null;
  render();
};

if (tableSearch) {
  tableSearch.addEventListener('input', renderTables);
}

btnAddTable?.addEventListener('click', addTable);
newTableName?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    addTable();
  }
});

btnAddColumn?.addEventListener('click', addColumn);

btnSaveTemplate?.addEventListener('click', () => {
  saveToLocal();
  btnSaveTemplate.textContent = 'تم الحفظ';
  setTimeout(() => {
    btnSaveTemplate.textContent = 'حفظ محلي';
  }, 1500);
});

btnExportJson?.addEventListener('click', copyJson);

tableNameInput?.addEventListener('input', (event) => {
  const table = schema.find((entry) => entry.id === activeTableId);
  if (!table) return;
  table.name = event.target.value.trim();
  markChanges();
  renderTables();
  renderJson();
});

window.addEventListener('beforeunload', (event) => {
  if (hasLocalChanges) {
    event.preventDefault();
    event.returnValue = '';
  }
});

loadSchema();
