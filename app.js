// Cấu hình worker cho PDF.js
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// System Prompt chuyên sâu về hệ thống VELA Logistics (Đã cập nhật theo nghiệp vụ thực tế)
const VELA_DOMAIN_CONTEXT = `
BẠN LÀ SENIOR QA LEAD VÀ PRODUCT SPECIALIST CỦA HỆ THỐNG "VELA" - NỀN TẢNG QUẢN LÝ LOGISTICS & FREIGHT FORWARDING ĐA PHƯƠNG THỨC.
BẠN PHẢI TUÂN THỦ CHẶT CHẼ CÁC QUY TẮC NGHIỆP VỤ THỰC TẾ DƯỚI ĐÂY KHI THIẾT KẾ TEST CASE, CHECKLIST HOẶC TICKET BUG:

1. ĐƠN VỊ VẬN HÀNH (NETWORK COMPANIES - NC) & SCOPE HIỆN TẠI:
   - NC "ITLLOG": Tích hợp trực tiếp với "eTMS", xử lý hàng đường bộ Road (FTL, LCL, FCL).
   - NC "SEINO": Tích hợp trực tiếp với "Dash", xử lý hàng đường bộ Road (FTL, LCL, FCL).
   - NC "ITLFM": Tích hợp với "eFMS", xử lý hàng đường biển & đường hàng không (Sea FCL, Sea LCL, Air).
     * LƯU Ý ĐẶC BIỆT VỀ SCOPE ITLFM: Chưa triển khai tính năng Shipment hay Track & Trace. Chỉ làm phạm vi từ RFQ -> Báo giá PNL -> Quotation -> Contract -> Booking. TUYỆT ĐỐI không viết test case tạo/nhận Shipment cho ITLFM.

2. QUY TẮC VỀ VÒNG ĐỜI VÀ TRIGGER DỮ LIỆU:
   - TRIGGER BOOKING ĐẨY ĐI: Khi khách hàng bấm "Submit" ngay trên "Customer Portal", hệ thống VELA phải tự động gọi API đẩy (Push) Booking sang eTMS (đối với ITLLOG) hoặc sang Dash (đối với SEINO). Không cần bước duyệt trung gian của Ops mới đẩy.
   - QUY TẮC SHIPMENT (INBOUND SYNC ONLY):
     * VELA KHÔNG TẠO SHIPMENT thủ công được. Không có nút "Create Shipment" trên VELA Core hay bất kỳ Portal nào.
     * Toàn bộ dữ liệu Shipment và Track & Trace trên VELA là dạng ĐỒNG BỘ MỘT CHIỀU (Inbound Sync) nhận từ eTMS (ITLLOG) hoặc Dash (SEINO) đẩy về.
     * Cần test kỹ: Nhận payload từ eTMS/Dash tạo shipment trên VELA, map chính xác với Booking ID, cập nhật mốc lộ trình, tải trọng, biển số xe, tài xế, và xử lý khi API bên ngoài bị lỗi hoặc đẩy trùng/thiếu trường.

3. QUY TẮC BÁO GIÁ VÀ CHI PHÍ (COST PRICING - INTERNAL VS OUTSOURCE):
   - Có 2 nguồn tiếp nhận chi phí (Cost) vào hệ thống VELA để phục vụ tính PNL:
     (1) Nguồn từ eTMS: eTMS sync về VELA gồm cả "Giá Internal" (Xe/chi phí nội bộ) và "Giá Outsource" (Thuê xe ngoài).
     (2) Nguồn từ VELA Supplier Portal: Dành cho trường hợp gửi yêu cầu chi phí (Request Cost) cho nhà cung cấp. Supplier có thể nhập và tạo cả "Giá Internal" và "Giá Outsource".
   - VELA Core sử dụng các nguồn giá này để tính toán bảng PNL (Revenue - Cost = Margin/Profit) trước khi phát hành Quotation.
   - Cần test kỹ: So sánh giá Internal vs Outsource, áp dụng đúng loại giá cho từng loại xe/tuyến đường, làm tròn số tiền tệ, thuế VAT, và bảo mật dữ liệu giá.

4. CẤU TRÚC 3 HỆ THỐNG GIAO DIỆN & PHÂN QUYỀN (PORTALS):
   - "VELA Core": Quản trị nội bộ dành cho Ops, Pricing, CS, Admin. Quản lý PNL, duyệt Quotation, Contract, giám sát Booking và xem dữ liệu Shipment sync về.
   - "Customer Portal": Khách hàng tạo RFQ, nhận Quotation, quản lý Contract, tạo & Submit Booking, xem Track & Trace. (Bảo mật: TUYỆT ĐỐI không thấy giá Cost PNL, giá Internal/Outsource của nhà xe).
   - "Supplier Portal": Dành cho nhà cung cấp/vận tải tạo và phản hồi giá Internal / Outsource khi có Request Cost, xác nhận thông tin đơn hàng. (Bảo mật: Không thấy giá bán cho khách).
`;

let currentMode = 'testcase';
let generatedData = null;
let uploadedDocumentText = ""; // Lưu trữ nội dung văn bản trích xuất từ file tải lên

// DOM Elements
const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameText = document.getElementById('fileNameText');
const removeFileBtn = document.getElementById('removeFileBtn');
const acContentInput = document.getElementById('acContentInput');
const btnGenerate = document.getElementById('btnGenerate');
const btnText = document.getElementById('btnText');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const testCaseView = document.getElementById('testCaseView');
const checklistView = document.getElementById('checklistView');
const bugView = document.getElementById('bugView');
const tcTableBody = document.getElementById('tcTableBody');
const resultCount = document.getElementById('resultCount');
const outputTitle = document.getElementById('outputTitle');
const btnExportCSV = document.getElementById('btnExportCSV');
const btnCopyResult = document.getElementById('btnCopyResult');
const filterBar = document.getElementById('filterBar');
const filterSearch = document.getElementById('filterSearch');
const filterPriority = document.getElementById('filterPriority');
const modeButtons = document.querySelectorAll('.mode-btn');
const ctxNC = document.getElementById('ctxNC');
const ctxPortal = document.getElementById('ctxPortal');

// Load API Key từ localStorage
const savedKey = localStorage.getItem('GEMINI_API_KEY');
if (savedKey) apiKeyInput.value = savedKey;

saveKeyBtn.addEventListener('click', () => {
  localStorage.setItem('GEMINI_API_KEY', apiKeyInput.value.trim());
  alert('Đã lưu API Key vào trình duyệt!');
});

// Chuyển Mode
modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modeButtons.forEach(b => {
      b.classList.remove('active', 'border-indigo-500', 'bg-indigo-50/70', 'text-indigo-700');
      b.classList.add('border-slate-200', 'bg-white', 'text-slate-600');
    });
    btn.classList.add('active', 'border-indigo-500', 'bg-indigo-50/70', 'text-indigo-700');
    btn.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');

    currentMode = btn.dataset.mode;
    updateModeUI();
  });
});

function updateModeUI() {
  if (currentMode === 'testcase') {
    btnText.textContent = 'Phân tích Feature & Tạo Test Cases';
    outputTitle.innerHTML = '<i class="ph-bold ph-table text-indigo-600"></i> Bảng Test Cases (<span id="resultCount">0</span>)';
    btnExportCSV.classList.remove('hidden');
    filterBar.classList.remove('hidden');
  } else if (currentMode === 'checklist') {
    btnText.textContent = 'Phân tích Feature & Tạo Checklist';
    outputTitle.innerHTML = '<i class="ph-bold ph-check-square-offset text-indigo-600"></i> Test Checklist (<span id="resultCount">0</span>)';
    btnExportCSV.classList.add('hidden');
    filterBar.classList.remove('hidden');
  } else {
    btnText.textContent = 'Chuẩn Hóa Ticket Bug Chuẩn Jira';
    outputTitle.innerHTML = '<i class="ph-bold ph-bug text-indigo-600"></i> Bug Tickets Chuẩn Jira (<span id="resultCount">0</span>)';
    btnExportCSV.classList.add('hidden');
    filterBar.classList.add('hidden');
    acContentInput.placeholder = `Mô tả lỗi bạn gặp phải bằng ngôn ngữ tự nhiên, ví dụ:
- Khách submit booking road FTL trên Customer Portal của ITLLOG nhưng không thấy bắn API sang eTMS, trang bị đơ loading xoay tròn hoài.
- Giá outsource bên Supplier Portal gửi về bị nhân đôi khi tính PNL trên VELA Core.
- eTMS sync shipment về nhưng thiếu mất số xe và tên tài xế trên màn hình Track & Trace.`;
  }
}

// Xử lý nạp tài liệu Feature Document (.pdf, .docx, .txt, .md)
dropZone.addEventListener('click', (e) => {
  if (e.target.closest('#removeFileBtn')) return;
  fileInput.click();
});
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-indigo-500'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-indigo-500'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-indigo-500');
  if (e.dataTransfer.files.length) handleDocumentFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleDocumentFile(e.target.files[0]);
});

removeFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  uploadedDocumentText = "";
  fileInput.value = "";
  fileInfo.classList.add('hidden');
});

async function handleDocumentFile(file) {
  fileNameText.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  fileInfo.classList.remove('hidden');

  const ext = file.name.split('.').pop().toLowerCase();

  try {
    if (ext === 'docx') {
      const reader = new FileReader();
      reader.onload = function(evt) {
        mammoth.extractRawText({ arrayBuffer: evt.target.result })
          .then(res => { uploadedDocumentText = res.value; })
          .catch(err => alert('Lỗi đọc file docx: ' + err.message));
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'pdf') {
      const reader = new FileReader();
      reader.onload = async function(evt) {
        try {
          const typedarray = new Uint8Array(evt.target.result);
          const pdf = await pdfjsLib.getDocument(typedarray).promise;
          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += `\n--- [Trang ${i}] ---\n` + pageText;
          }
          uploadedDocumentText = fullText;
        } catch (err) {
          alert('Lỗi giải nén nội dung PDF: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = function(evt) { uploadedDocumentText = evt.target.result; };
      reader.readAsText(file);
    }
  } catch (e) {
    alert('Không thể đọc file: ' + e.message);
  }
}

// Xử lý tạo kết quả
btnGenerate.addEventListener('click', async () => {
  const manualInput = acContentInput.value.trim();

  if (!uploadedDocumentText && !manualInput) {
    return alert('Vui lòng tải lên tài liệu Feature Document (Word/PDF) hoặc dán nội dung vào ô bên dưới!');
  }

  const apiKey = apiKeyInput.value.trim() || localStorage.getItem('GEMINI_API_KEY');
  if (!apiKey) return alert('Vui lòng nhập Gemini API Key ở góc trên bên phải!');

  loadingState.classList.remove('hidden');
  emptyState.classList.add('hidden');
  testCaseView.classList.add('hidden');
  checklistView.classList.add('hidden');
  bugView.classList.add('hidden');
  btnGenerate.disabled = true;

  const ncVal = ctxNC.value;
  const portalVal = ctxPortal.value;

  // Ghép nối tài liệu và yêu cầu bổ sung
  const combinedUserPrompt = `
[THÔNG TIN DỰ ÁN VÀ NGỮ CẢNH TEST]:
- Đơn vị NC: ${ncVal}
- Cổng tương tác (Portal): ${portalVal}
- Kiểm tra tích hợp API (eTMS/eFMS/Dash): ${document.getElementById('chkIntegration').checked}
- Kiểm tra Boundary / Edge / Validation: ${document.getElementById('chkEdge').checked}
- Kiểm tra Phân quyền / Data Isolation: ${document.getElementById('chkSecurity').checked}

${uploadedDocumentText ? `[NỘI DUNG TÀI LIỆU FEATURE DOCUMENT / SRS / PRD ĐƯỢC TẢI LÊN]:\n${uploadedDocumentText}\n` : ''}

${manualInput ? `[YÊU CẦU / AC HOẶC PHẠM VI BỔ SUNG TỪ QA]:\n${manualInput}\n` : ''}
`;

  let promptInstruct = VELA_DOMAIN_CONTEXT;
  if (currentMode === 'testcase') {
    promptInstruct += `\nNHIỆM VỤ: Hãy phân tích toàn bộ tài liệu Feature Document trên và sinh danh sách Test Case chi tiết theo định dạng JSON sau:
{
  "test_cases": [
    {
      "id": "TC_001",
      "module": "Tên Module / Màn hình trong tài liệu",
      "scenario": "Mô tả kịch bản test cụ thể",
      "preconditions": "Tiền đề (NC, Portal, trạng thái dữ liệu)",
      "steps": "1. Bước 1\\n2. Bước 2...",
      "test_data": "Dữ liệu test mẫu (Mã đơn, loại cont/xe, giá trị biên...)",
      "expected_result": "Kết quả mong đợi (cả giao diện UI lẫn hành vi API)",
      "type": "Positive" | "Negative" | "Integration" | "Boundary",
      "priority": "P0" | "P1" | "P2" | "P3"
    }
  ]
}`;
  } else if (currentMode === 'checklist') {
    promptInstruct += `\nNHIỆM VỤ: Bóc tách tài liệu Feature Document thành checklist kiểm thử nhanh cho QA theo định dạng JSON sau:
{
  "checklist": [
    {
      "category": "Tên nhóm (ví dụ: UI & Validation, Quy tắc nghiệp vụ, Tích hợp API, Phân quyền)",
      "item": "Kiểm tra...",
      "priority": "P0" | "P1" | "P2" | "P3"
    }
  ]
}`;
  } else {
        promptInstruct += `\nNHIỆM VỤ ĐẶC BIỆT (BUG TRANSLATOR & JIRA FORMATTER):
Người dùng sẽ cung cấp một mô tả lỗi vắn tắt, thô sơ hoặc log ghi nhận thực tế. Bạn hãy đóng vai trò Senior QA Lead phân tích, đối chiếu với bối cảnh hệ thống VELA và chuẩn hóa thành danh sách Ticket Bug chuyên nghiệp theo JSON:
{
  "bugs": [
    {
      "summary": "[VELA][${ncVal}][${portalVal}][Tên Module] Tiêu đề ngắn gọn, súc tích, phản ánh chính xác bản chất lỗi",
      "issue_type": "Bug",
      "severity": "Critical" | "Major" | "Minor",
      "priority": "P0" | "P1" | "P2",
      "preconditions": "Môi trường (Staging/UAT), NC (${ncVal}), Cổng (${portalVal}), dữ liệu cần có sẵn (ví dụ: Booking ID trạng thái Draft...)",
      "steps_to_reproduce": "Các bước tái hiện chi tiết (Nếu người dùng không nêu rõ bước, hãy tự suy luận các bước hợp lý theo chuẩn luồng VELA để dẫn đến lỗi)",
      "actual_result": "Mô tả trạng thái lỗi thực tế đang xảy ra (UI hiển thị sai, API fail, không sync dữ liệu...)",
      "expected_result": "Hành vi kỳ vọng đúng theo logic nghiệp vụ VELA (Status chuyển đổi đúng, API trigger thành công, dữ liệu hiển thị chuẩn...)",
      "suggested_fix": "Gợi ý nguyên nhân kỹ thuật hoặc vị trí cần fix (Endpoint API, trigger Webhook, logic mapping JSON payload eTMS/Dash, hoặc validation DB)"
    }
  ]
}`;
  }

  const payload = {
    contents: [{ parts: [{ text: combinedUserPrompt }] }],
    systemInstruction: { parts: [{ text: promptInstruct }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  };

  try {
    const models = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
    let res = null;
    let lastErr = null;

    for (const m of models) {
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) break;
        lastErr = await res.text();
      } catch (e) {
        lastErr = e.message;
      }
    }

    if (!res || !res.ok) throw new Error(lastErr || 'Lỗi kết nối Gemini API');

    const json = await res.json();
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    generatedData = JSON.parse(rawText);

    renderOutput();

  } catch (err) {
    alert('Lỗi: ' + err.message);
    emptyState.classList.remove('hidden');
  } finally {
    loadingState.classList.add('hidden');
    btnGenerate.disabled = false;
  }
});

// Render UI kết quả
function renderOutput() {
  if (!generatedData) return;
  if (currentMode === 'testcase') renderTestCaseTable(generatedData.test_cases || []);
  else if (currentMode === 'checklist') renderChecklist(generatedData.checklist || []);
  else if (currentMode === 'bug') renderBugTickets(generatedData.bugs || []);
}

function renderTestCaseTable(items) {
  testCaseView.classList.remove('hidden');
  tcTableBody.innerHTML = '';
  document.getElementById('resultCount').textContent = items.length;

  items.forEach(tc => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';

    const prioBadge = {
      'P0': 'bg-rose-100 text-rose-700',
      'P1': 'bg-amber-100 text-amber-700',
      'P2': 'bg-blue-100 text-blue-700',
      'P3': 'bg-slate-100 text-slate-600'
    }[tc.priority] || 'bg-slate-100 text-slate-600';

    tr.innerHTML = `
      <td class="py-2.5 px-2.5 font-mono font-bold text-indigo-700">${tc.id}</td>
      <td class="py-2.5 px-3">
        ${tc.module ? `<span class="inline-block bg-slate-100 text-slate-700 text-[10px] font-semibold px-1.5 py-0.5 rounded mb-1">${escapeHtml(tc.module)}</span>` : ''}
        <div class="font-medium text-slate-800">${escapeHtml(tc.scenario)}</div>
        ${tc.preconditions ? `<div class="text-[11px] text-slate-400 mt-0.5"><span class="font-semibold text-slate-500">Tiền đề:</span> ${escapeHtml(tc.preconditions)}</div>` : ''}
      </td>
      <td class="py-2.5 px-3 font-mono text-[11px] leading-tight">
        <div class="whitespace-pre-line text-slate-600">${escapeHtml(tc.steps)}</div>
        ${tc.test_data ? `<div class="mt-1 text-slate-500 font-sans"><span class="font-semibold text-slate-700">Data:</span> ${escapeHtml(tc.test_data)}</div>` : ''}
      </td>
      <td class="py-2.5 px-3 text-slate-700">${escapeHtml(tc.expected_result)}</td>
      <td class="py-2.5 px-2 text-center">
        <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border">${tc.type}</span>
      </td>
      <td class="py-2.5 px-2 text-center">
        <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${prioBadge}">${tc.priority}</span>
      </td>
    `;
    tcTableBody.appendChild(tr);
  });
}

function renderChecklist(items) {
  checklistView.classList.remove('hidden');
  checklistView.innerHTML = '';
  document.getElementById('resultCount').textContent = items.length;

  const groups = {};
  items.forEach(it => {
    const cat = it.category || 'Chung';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(it);
  });

  Object.keys(groups).forEach(cat => {
    const groupEl = document.createElement('div');
    groupEl.className = 'border border-slate-200 rounded-xl p-3 bg-white mb-3 shadow-xs';
    
    let rowsHtml = '';
    groups[cat].forEach(it => {
      rowsHtml += `
        <div class="flex items-start justify-between py-1.5 border-b border-slate-100 last:border-none gap-2">
          <label class="flex items-start space-x-2 text-xs text-slate-700 cursor-pointer flex-1">
            <input type="checkbox" class="rounded text-indigo-600 focus:ring-indigo-500 mt-0.5" />
            <span class="leading-relaxed">${escapeHtml(it.item)}</span>
          </label>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${it.priority}</span>
        </div>
      `;
    });

    groupEl.innerHTML = `
      <div class="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <i class="ph-bold ph-folder-open"></i> ${escapeHtml(cat)} (${groups[cat].length})
      </div>
      <div class="space-y-1">${rowsHtml}</div>
    `;
    checklistView.appendChild(groupEl);
  });
}

function renderBugTickets(bugs) {
  bugView.classList.remove('hidden');
  bugView.innerHTML = '';
  document.getElementById('resultCount').textContent = bugs.length;

  bugs.forEach((b, idx) => {
    const card = document.createElement('div');
    card.className = 'border border-rose-200 bg-white rounded-xl p-4 shadow-sm mb-4';

    const sevBadge = {
      'Critical': 'bg-rose-600 text-white',
      'Major': 'bg-rose-100 text-rose-700',
      'Minor': 'bg-amber-100 text-amber-700'
    }[b.severity] || 'bg-slate-100 text-slate-600';

    // Tạo text chuẩn định dạng Jira Markdown để copy nhanh
    const jiraText = `*Summary:* ${b.summary}
*Issue Type:* Bug | *Severity:* ${b.severity} | *Priority:* ${b.priority}

*Preconditions:*
${b.preconditions || 'N/A'}

*Steps to Reproduce:*
${b.steps_to_reproduce}

*Actual Result:*
${b.actual_result}

*Expected Result:*
${b.expected_result}

${b.suggested_fix ? `*Suggested Fix / Technical Notes:*\n${b.suggested_fix}` : ''}`;

    card.innerHTML = `
      <div class="flex items-start justify-between border-b border-slate-100 pb-2 mb-3">
        <div class="flex items-center space-x-2 flex-1 mr-2">
          <span class="bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold px-2 py-0.5 rounded shrink-0">
            <i class="ph-bold ph-bug"></i> BUG-${idx + 1}
          </span>
          <h3 class="font-bold text-slate-900 text-xs sm:text-sm">${escapeHtml(b.summary)}</h3>
        </div>
        <div class="flex items-center space-x-2 shrink-0">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded ${sevBadge}">${b.severity}</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">${b.priority}</span>
          <button class="copy-single-bug-btn text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded transition flex items-center gap-1" title="Sao chép format Jira">
            <i class="ph-bold ph-copy"></i>
          </button>
        </div>
      </div>

      <div class="space-y-2 text-xs">
        ${b.preconditions ? `<div><span class="font-semibold text-slate-500">Tiền đề (Preconditions):</span> <span class="text-slate-700 font-mono text-[11px]">${escapeHtml(b.preconditions)}</span></div>` : ''}
        
        <div>
          <div class="font-semibold text-slate-500 mb-0.5">Các bước tái hiện (Steps to Reproduce):</div>
          <div class="whitespace-pre-line bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono text-[11px] text-slate-700">${escapeHtml(b.steps_to_reproduce)}</div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
          <div class="bg-rose-50/70 border border-rose-100 p-2.5 rounded-lg">
            <span class="font-bold text-rose-700 block mb-1">❌ Thực tế (Actual Result):</span>
            <span class="text-slate-700 leading-relaxed">${escapeHtml(b.actual_result)}</span>
          </div>
          <div class="bg-emerald-50/70 border border-emerald-100 p-2.5 rounded-lg">
            <span class="font-bold text-emerald-700 block mb-1">✅ Kỳ vọng (Expected Result):</span>
            <span class="text-slate-700 leading-relaxed">${escapeHtml(b.expected_result)}</span>
          </div>
        </div>

        ${b.suggested_fix ? `<div class="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100"><span class="font-semibold text-indigo-600">💡 Gợi ý kỹ thuật / Endpoint:</span> ${escapeHtml(b.suggested_fix)}</div>` : ''}
      </div>
    `;

    // Gán sự kiện copy cho từng ticket
    card.querySelector('.copy-single-bug-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(jiraText).then(() => alert(`Đã sao chép nội dung BUG-${idx + 1} theo định dạng Jira!`));
    });

    bugView.appendChild(card);
  });
}

// Tìm kiếm
function applyFilter() {
  if (!generatedData) return;
  const q = filterSearch.value.toLowerCase();
  const prio = filterPriority.value;

  if (currentMode === 'testcase' && generatedData.test_cases) {
    const filtered = generatedData.test_cases.filter(tc => {
      const matchQuery = (tc.scenario || '').toLowerCase().includes(q) || 
                         (tc.steps || '').toLowerCase().includes(q) || 
                         (tc.module || '').toLowerCase().includes(q) || 
                         (tc.id || '').toLowerCase().includes(q);
      const matchPrio = prio === 'ALL' || tc.priority === prio;
      return matchQuery && matchPrio;
    });
    renderTestCaseTable(filtered);
  }
}

filterSearch.addEventListener('input', applyFilter);
filterPriority.addEventListener('change', applyFilter);

// Export CSV
btnExportCSV.addEventListener('click', () => {
  if (!generatedData || !generatedData.test_cases?.length) return alert('Chưa có Test Case để xuất CSV!');
  const headers = ['ID', 'Module', 'Scenario', 'Preconditions', 'Steps', 'Test Data', 'Expected Result', 'Type', 'Priority'];
  const rows = generatedData.test_cases.map(tc => [
    `"${tc.id}"`,
    `"${(tc.module || '').replace(/"/g, '""')}"`,
    `"${(tc.scenario || '').replace(/"/g, '""')}"`,
    `"${(tc.preconditions || '').replace(/"/g, '""')}"`,
    `"${(tc.steps || '').replace(/"/g, '""')}"`,
    `"${(tc.test_data || '').replace(/"/g, '""')}"`,
    `"${(tc.expected_result || '').replace(/"/g, '""')}"`,
    `"${tc.type}"`,
    `"${tc.priority}"`
  ]);
  const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `VELA_TestCases_${Date.now()}.csv`;
  link.click();
});

// Copy Result
btnCopyResult.addEventListener('click', () => {
  if (!generatedData) return alert('Chưa có dữ liệu!');
  let text = '';
  if (currentMode === 'testcase') {
    text = '| ID | Module | Scenario | Steps | Expected Result | Type | Priority |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';
    generatedData.test_cases.forEach(tc => {
      text += `| ${tc.id} | ${tc.module||'-'} | ${tc.scenario} | ${(tc.steps||'').replace(/\n/g, '<br>')} | ${tc.expected_result} | ${tc.type} | ${tc.priority} |\n`;
    });
  } else if (currentMode === 'checklist') {
    generatedData.checklist.forEach(it => {
      text += `- [ ] [${it.priority}] (${it.category}) ${it.item}\n`;
    });
  } else if (currentMode === 'bug') {
    generatedData.bugs.forEach((b, i) => {
      text += `h2. BUG-${i+1}: ${b.summary}\n*Severity:* ${b.severity} | *Priority:* ${b.priority}\n*Pre-conditions:* ${b.preconditions || 'N/A'}\n*Steps to Reproduce:*\n${b.steps_to_reproduce}\n*Actual Result:* ${b.actual_result}\n*Expected Result:* ${b.expected_result}\n\n----\n`;
    });
  }
  navigator.clipboard.writeText(text).then(() => alert('Đã sao chép nội dung vào Clipboard!'));
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}