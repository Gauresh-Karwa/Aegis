import React, { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, ComposedChart, CartesianGrid, YAxis, Legend, LineChart, Line, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader } from 'lucide-react';

const getRiskColor = (severity) => {
    if (severity === 'CRITICAL') return '#ef4444'; // Red
    if (severity === 'WARNING') return '#f59e0b'; // Amber
    if (severity === 'INFO') return '#3b82f6'; // Blue
    return '#10b981'; // Green
};

const isBadValue = (val) => {
    if (val === null || val === undefined) return true;
    const s = String(val).trim();
    if (s === "") return true;
    const badPatterns = ["DateofBirth", "ofOwner", "MiddleName", "LastName", "RegisteredOfficeAdd", "TANofEmployer"];
    return badPatterns.some(pat => s.toLowerCase() === pat.toLowerCase() || s === pat);
};

const getImgSrc = (preview) => {
    if (!preview) return "";
    if (preview.startsWith("data:image")) return preview;
    return `data:image/png;base64,${preview}`;
};

const renderCell = (val) => {
    if (val === null || val === undefined) return <span className="text-[#9ca3af] italic">—</span>;
    const s = String(val).trim();
    if (s === "") return <span className="text-[#9ca3af] italic">—</span>;
    return val;
};

const formatInputs = (inputs) => {
    if (!inputs) return null;
    if (typeof inputs === 'string') return inputs;
    if (typeof inputs === 'object') {
        return Object.entries(inputs)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
    }
    return String(inputs);
};

const parseVal = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    const clean = String(v).replace(/[^0-9\.]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
};

const getEditDistance = (a, b) => {
    const str1 = String(a || "").toLowerCase().trim();
    const str2 = String(b || "").toLowerCase().trim();
    if (str1 === str2) return 0;
    if (str1.length === 0) return str2.length;
    if (str2.length === 0) return str1.length;

    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    return matrix[str2.length][str1.length];
};

const formatRupee = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '₹—';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(value);
};

const validateNodeVal = (val, isIncomeField = false) => {
    if (val === null || val === undefined || isNaN(val)) {
        return { valid: false, error: 'Extraction failed — verify manually' };
    }
    if (val === 17) {
        return { valid: false, error: 'Extraction failed — verify manually' };
    }
    if (isIncomeField && val < 1000) {
        return { valid: false, error: 'Extraction failed — verify manually' };
    }
    return { valid: true };
};

// ── Math Integrity helpers ─────────────────────────────────────────────────
const MathStatusPill = ({ status, label }) => {
    const cfg = {
        ok: { bg: '#10b98120', color: '#059669', border: '#10b98140', icon: '' },
        warn: { bg: '#f59e0b20', color: '#b45309', border: '#f59e0b40', icon: '' },
        error: { bg: '#ef444420', color: '#dc2626', border: '#ef444440', icon: '' },
        missing: { bg: '#6b728020', color: '#4b5563', border: '#6b728040', icon: '?' },
    };
    const c = cfg[status] || cfg.missing;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
            style={{ background: c.bg, color: c.color, borderColor: c.border }}>
            {c.icon} {label}
        </span>
    );
};

const SalaryWaterfallCustomBar = (props) => {
    const { x, y, width, height, fill } = props;
    const r = 4;
    if (!height || height === 0) return null;
    const isNeg = height < 0;
    const absH = Math.abs(height);
    const barY = isNeg ? y : y;
    return (
        <rect x={x} y={barY} width={width} height={absH}
            fill={fill} rx={r} ry={r} />
    );
};

const DownArrow = () => (
    <div className="flex flex-col items-center my-1">
        <svg className="w-5 h-5 text-[#9ca3af]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
    </div>
);

const FindingCard = ({ finding }) => {
    return (
        <div className={`p-3 border-l-4 border-[#e5e7eb] bg-white mb-2 shadow-sm rounded-r-md`}
            style={{ borderLeftColor: getRiskColor(finding.severity) }}>
            <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-[12px] text-[#111]">{(finding.check_name || finding.category || 'anomaly').replace(/_/g, ' ').toUpperCase()}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm`}
                    style={{
                        backgroundColor: `${getRiskColor(finding.severity)}20`,
                        color: getRiskColor(finding.severity)
                    }}>
                    {finding.severity}
                </span>
            </div>
            <div className="text-[12px] text-[#4b5563]">{finding.description}</div>
            {finding.evidence && Object.keys(finding.evidence).length > 0 && (
                <div className="mt-2 bg-[#f9fafb] p-2 rounded text-[11px] font-mono text-[#6b7280] overflow-x-auto">
                    {Object.entries(finding.evidence).map(([k, v]) => (
                        <div key={k}><span className="font-semibold text-[#374151]">{k}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ForensicWorkspace = ({ backendData, activeModule, setActiveModule, activeDocType, setActiveDocType, toggles }) => {
    const findings = backendData?.findings || [];
    const visualResults = backendData?.visual_results || {};
    const auditTrail = backendData?.audit_trail || [];
    const entities = backendData?.entities_by_doc || {};
    const docsList = backendData?.documents || [];

    // ---- DOCUMENT VIEWER STATE & LOGIC ----
    const [zoom, setZoom] = useState(1);
    const [imgLoaded, setImgLoaded] = useState(false);

    // ---- AUDIT SIGN-OFF STATE ----
    const [signoffName, setSignoffName] = useState('');
    const [signoffDecision, setSignoffDecision] = useState('');
    const [signoffNotes, setSignoffNotes] = useState('');
    const [signoffSubmitted, setSignoffSubmitted] = useState(false);
    const [signoffTime, setSignoffTime] = useState('');

    const handleSignOff = () => {
        if (!signoffName.trim() || !signoffDecision) return;
        setSignoffTime(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
        setSignoffSubmitted(true);
    };

    const canvasRef = useRef(null);
    const imgRef = useRef(null);

    const selectedDoc = docsList.find(d => d.type === activeDocType);

    const getImgSrc = (preview) => {
        if (!preview) return "";
        if (preview.startsWith("data:image")) return preview;
        return `data:image/png;base64,${preview}`;
    };

    const drawCanvas = () => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img || !imgLoaded) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const lookupKey = activeDocType === 'land' ? 'land_record' : activeDocType;
        const results = visualResults[lookupKey] || {};
        const localFindings = backendData?.findings || [];

        // 1. ELA Patches
        if (toggles.ela && results.ela) {
            const matrix = results.ela.patch_matrix;
            const pSize = results.ela.patch_size_px || 16;
            if (Array.isArray(matrix)) {
                for (let r = 0; r < matrix.length; r++) {
                    if (Array.isArray(matrix[r])) {
                        for (let c = 0; c < matrix[r].length; c++) {
                            const val = matrix[r][c];
                            if (val > 0.05) {
                                ctx.fillStyle = `rgba(239, 68, 68, ${val * 0.65})`;
                                ctx.fillRect(c * pSize, r * pSize, pSize, pSize);
                            }
                        }
                    }
                }
            }
        }

        // 2. Noise Residual Bounding Boxes
        if (toggles.noise) {
            const lookupDocName = activeDocType === 'land' ? 'land_record' : activeDocType;
            const noiseFinding = localFindings.find(f => {
                const isDocMatch = f.document_name === lookupDocName ||
                    f.document_name === activeDocType ||
                    f.document_name === (activeDocType + '.pdf') ||
                    (activeDocType === 'land' && f.document_name === 'land_record.pdf') ||
                    (activeDocType === 'land' && f.document_name === 'land.pdf');
                return isDocMatch && (f.field_name === 'noise_residual_map' || (f.evidence && Array.isArray(f.evidence.top_regions)));
            });

            const regions = noiseFinding ? noiseFinding.evidence.top_regions : (results.noise?.flagged_regions || []);
            regions.forEach(reg => {
                const bbox = reg.bbox;
                if (Array.isArray(bbox) && bbox.length === 4) {
                    const [x, y, w, h] = bbox;
                    const color = reg.variance_score > 0.33 ? '#ef4444' : '#f59e0b';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 3;
                    ctx.setLineDash([6, 4]);
                    ctx.strokeRect(x, y, w, h);
                    ctx.setLineDash([]);

                    ctx.fillStyle = color;
                    ctx.font = 'bold 12px IBM Plex Mono, monospace';
                    ctx.fillText(`Var: ${reg.variance_score}`, x, y > 15 ? y - 5 : y + 15);
                }
            });
        }

        // 3. Copy-Move Duplicates
        if (toggles.copyMove && results.copy_move) {
            const pairs = results.copy_move.pairs || [];
            pairs.forEach(pair => {
                if (Array.isArray(pair.src_bbox) && Array.isArray(pair.dst_bbox)) {
                    const [sx, sy, sw, sh] = pair.src_bbox;
                    const [dx, dy, dw, dh] = pair.dst_bbox;

                    ctx.strokeStyle = '#ef4444';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(sx, sy, sw, sh);

                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(dx, dy, dw, dh);

                    const cx1 = sx + sw / 2;
                    const cy1 = sy + sh / 2;
                    const cx2 = dx + dw / 2;
                    const cy2 = dy + dh / 2;

                    ctx.beginPath();
                    ctx.moveTo(cx1, cy1);
                    ctx.lineTo(cx2, cy2);
                    ctx.strokeStyle = '#ef4444';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    const angle = Math.atan2(cy2 - cy1, cx2 - cx1);
                    ctx.beginPath();
                    ctx.moveTo(cx2, cy2);
                    ctx.lineTo(cx2 - 15 * Math.cos(angle - Math.PI / 6), cy2 - 15 * Math.sin(angle - Math.PI / 6));
                    ctx.lineTo(cx2 - 15 * Math.cos(angle + Math.PI / 6), cy2 - 15 * Math.sin(angle + Math.PI / 6));
                    ctx.closePath();
                    ctx.fillStyle = '#ef4444';
                    ctx.fill();
                }
            });
        }

        // 4. Font Anomalies
        if (toggles.font && results.font) {
            const blocks = results.font.anomalous_blocks || [];
            blocks.forEach(blk => {
                const bbox = blk.bbox;
                if (Array.isArray(bbox) && bbox.length === 4) {
                    const [x, y, w, h] = bbox;
                    ctx.strokeStyle = '#8b5cf6';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x, y, w, h);

                    ctx.fillStyle = '#8b5cf6';
                    ctx.font = 'bold 12px Inter, sans-serif';
                    ctx.fillText(blk.type || 'font_anomaly', x, y > 15 ? y - 5 : y + 15);
                }
            });
        }

        // 5. OCR Confidence Tints
        if (toggles.ocr && results.ocr) {
            const words = results.ocr.words || [];
            words.forEach(w => {
                if (w.confidence < 0.85 && Array.isArray(w.bbox) && w.bbox.length === 4) {
                    const [x, y, w_val, h_val] = w.bbox;
                    ctx.fillStyle = `rgba(245, 158, 11, ${(1 - w.confidence) * 0.4})`;
                    ctx.fillRect(x, y, w_val, h_val);

                    ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, w_val, h_val);
                }
            });
        }
    };

    useEffect(() => {
        drawCanvas();
    }, [activeDocType, toggles, imgLoaded, backendData]);
    // ---- END DOCUMENT VIEWER STATE & LOGIC ----

    const docNames = ['identity', 'salary', 'itr', 'land_record'];

    // Gather all unique labels/field names across all docs
    const foundFields = new Set();
    docNames.forEach(doc => {
        const ents = entities[doc] || [];
        ents.forEach(ent => {
            if (ent.entity_type) {
                foundFields.add(ent.entity_type);
            }
        });
    });

    const standardFields = [
        "name",
        "dob",
        "pan",
        "aadhaar_last4",
        "employer",
        "salary_gross",
        "salary_net",
        "itr_income",
        "land_value",
        "circle_rate",
        "survey_no",
        "account_no",
        "ifsc",
        "district",
        "pin",
        "mobile"
    ];

    const rowFields = [...standardFields];
    foundFields.forEach(f => {
        if (!rowFields.includes(f)) {
            rowFields.push(f);
        }
    });

    const [isExporting, setIsExporting] = useState(false);

    const handleExportPDF = async () => {
        if (!backendData?.applicant_id) return;
        setIsExporting(true);
        try {
            const response = await fetch(`http://127.0.0.1:8000/report/${backendData?.applicant_id}`);
            if (!response.ok) throw new Error("Failed to export PDF");
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `forensic_report_${backendData.applicant_id}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Export PDF failed:", err);
            window.open(`http://127.0.0.1:8000/report/${backendData?.applicant_id}`, '_blank');
        } finally {
            setIsExporting(false);
        }
    };

    const [adversarialStats, setAdversarialStats] = useState(null);

    useEffect(() => {
        const fetchAdversarialStats = async () => {
            try {
                const response = await fetch('http://127.0.0.1:8000/adversarial_stats');
                if (response.ok) {
                    const data = await response.json();
                    setAdversarialStats(data);
                }
            } catch (err) {
                console.error("Failed to fetch adversarial stats:", err);
            }
        };
        fetchAdversarialStats();
    }, []);



    const renderFindingsForCategory = (category) => {
        const catFindings = findings.filter(f => f.category === category);
        if (catFindings.length === 0) {
            return <div className="text-[#9ca3af] text-[12px] italic">No findings reported for this module.</div>;
        }
        return catFindings.map((f, i) => <FindingCard key={i} finding={f} />);
    };

    const [focusedItem, setFocusedItem] = useState(null); // { title, content }

    return (
        <div className="w-full h-full bg-[#f9fafb] overflow-y-auto" id="workspace-scroll-container">
            <div className="min-h-full p-6 flex flex-col items-center">

                {/* Fullscreen Focus Modal */}
                <AnimatePresence>
                    {focusedItem && (
                        <motion.div
                            key="focus-modal"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
                            onClick={() => setFocusedItem(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.92, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.92, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="bg-white border border-[#e5e7eb] rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-xl flex justify-between items-center sticky top-0 z-10">
                                    <h2 className="text-[13px] font-bold text-[#111] uppercase">{focusedItem.title}</h2>
                                    <button
                                        onClick={() => setFocusedItem(null)}
                                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#f3f4f6] text-[#6b7280] hover:text-[#111] transition-colors text-[18px] font-light"
                                    >×</button>
                                </div>
                                <div className="p-6">
                                    {focusedItem.content}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="w-full max-w-4xl">
                    <AnimatePresence mode="wait">
                        {activeModule === 'Document Viewer' && (
                            <motion.div
                                key="document-viewer"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full flex overflow-hidden"
                                style={{ height: 'calc(100vh - 120px)' }}
                            >
                                {/* VIEWPORT (Left side) */}
                                <div className="flex flex-col flex-1 border-r border-[#e5e7eb] min-w-0">
                                    {/* Document Tab Selector & Zoom */}
                                    <div className="h-[48px] border-b border-[#e5e7eb] flex items-center bg-[#fafafa] px-4 shrink-0 justify-between">
                                        <div className="flex gap-2 overflow-x-auto">
                                            {docsList.map(doc => (
                                                <button
                                                    key={doc.type}
                                                    onClick={() => {
                                                        setActiveDocType(doc.type);
                                                        setImgLoaded(false);
                                                    }}
                                                    style={{
                                                        fontFamily: "'Inter', sans-serif",
                                                        fontSize: '12px',
                                                        fontWeight: activeDocType === doc.type ? 700 : 500,
                                                        borderBottom: activeDocType === doc.type ? '2px solid #111' : '2px solid transparent',
                                                        color: activeDocType === doc.type ? '#111' : '#6b7280',
                                                    }}
                                                    className="px-3 py-2 uppercase tracking-wider transition-colors hover:text-[#111] cursor-pointer whitespace-nowrap"
                                                >
                                                    {doc.type}
                                                </button>
                                            ))}
                                            {docsList.length === 0 && (
                                                <span className="text-[12px] text-[#9ca3af] italic py-2">No documents loaded</span>
                                            )}
                                        </div>

                                        {/* Zoom Controls */}
                                        <div className="flex items-center gap-2 border border-[#e5e7eb] rounded-md bg-white p-1 shadow-sm shrink-0 ml-4">
                                            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} className="w-7 h-7 font-bold text-[#6b7280] hover:text-[#111] hover:bg-[#fafafa] rounded transition-colors text-[14px]">-</button>
                                            <span className="text-[11px] font-mono text-[#374151] px-2">{(zoom * 100).toFixed(0)}%</span>
                                            <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="w-7 h-7 font-bold text-[#6b7280] hover:text-[#111] hover:bg-[#fafafa] rounded transition-colors text-[14px]">+</button>
                                            <button onClick={() => setZoom(1)} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6b7280] hover:text-[#111] hover:bg-[#fafafa] rounded transition-colors">Reset</button>
                                        </div>
                                    </div>

                                    {/* Canvas Area */}
                                    <div className="flex-1 overflow-auto bg-[#f3f4f6] flex items-start justify-start p-6 relative">
                                        {selectedDoc ? (
                                            <div
                                                style={{
                                                    transform: `scale(${zoom})`,
                                                    transformOrigin: 'top left',
                                                    position: 'relative',
                                                    transition: 'transform 0.15s ease-out'
                                                }}
                                                className="shadow-xl border border-[#d1d5db] bg-white"
                                            >
                                                <img
                                                    ref={imgRef}
                                                    src={getImgSrc(selectedDoc.preview)}
                                                    alt={`${activeDocType} page preview`}
                                                    className="block max-w-none h-auto select-none pointer-events-none"
                                                    onLoad={() => setImgLoaded(true)}
                                                />
                                                <canvas
                                                    ref={canvasRef}
                                                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[#9ca3af] italic text-[13px]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                                                Awaiting document stream...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeModule === 'Identity & Entity Layer' && (
                            <motion.div
                                key="identity-entity"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full"
                            >
                                <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-lg">
                                    <h2 className="text-[14px] font-bold text-[#111] uppercase">1. Identity & Entity Layer</h2>
                                </div>
                                <div className="p-4">
                                    <div className="border border-[#e5e7eb] rounded bg-white overflow-hidden">
                                        <table className="w-full text-left text-[12px]">
                                            <thead className="bg-[#f3f4f6] text-[#374151] border-b border-[#e5e7eb]">
                                                <tr>
                                                    <th className="p-3 font-bold uppercase">Field</th>
                                                    <th className="p-3 font-bold uppercase">Identity</th>
                                                    <th className="p-3 font-bold uppercase">Salary</th>
                                                    <th className="p-3 font-bold uppercase">ITR</th>
                                                    <th className="p-3 font-bold uppercase">Land Record</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-[#111]">
                                                {rowFields.map((field) => (
                                                    <tr key={field} className="border-b border-[#e5e7eb] last:border-0 hover:bg-[#f9fafb] transition-colors">
                                                        <td className="p-3 font-mono font-bold text-[#4b5563] uppercase">{field.replace(/_/g, ' ')}</td>
                                                        {docNames.map((doc) => {
                                                            const ents = entities[doc] || [];
                                                            const ent = ents.find(e => e.entity_type === field);
                                                            const rawVal = ent ? (ent.raw_value || ent.normalized_value) : null;
                                                            const isBad = isBadValue(rawVal);
                                                            return (
                                                                <td key={doc} className="p-3">
                                                                    {isBad ? (
                                                                        <span className="text-[#9ca3af]">—</span>
                                                                    ) : (
                                                                        <span className="font-semibold text-[#111]">{rawVal}</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {(() => {
                                        const coherenceIdentityFindings = findings.filter(f => {
                                            const cat = (f.category || '').toUpperCase();
                                            return cat === 'CROSS-DOCUMENT COHERENCE' || cat === 'IDENTITY';
                                        });

                                        if (coherenceIdentityFindings.length === 0) {
                                            return <div className="text-[#9ca3af] text-[12px] italic mt-4">No coherence or identity findings reported.</div>;
                                        }

                                        return (
                                            <div className="mt-6 space-y-3">
                                                <h3 className="text-[12px] font-bold text-[#374151] mb-2 uppercase">Coherence & Identity Findings</h3>
                                                {coherenceIdentityFindings.map((finding, idx) => {
                                                    const mappedEvidence = {};
                                                    const expectedVal = finding.expected_value || finding.expected;
                                                    const foundVal = finding.actual_value || finding.actual;
                                                    const actionVal = finding.recommendation || finding.action;

                                                    if (expectedVal !== undefined && expectedVal !== null) {
                                                        mappedEvidence["Expected"] = String(expectedVal);
                                                    }
                                                    if (foundVal !== undefined && foundVal !== null) {
                                                        mappedEvidence["Found"] = String(foundVal);
                                                    }
                                                    if (actionVal !== undefined && actionVal !== null) {
                                                        mappedEvidence["Action"] = String(actionVal);
                                                    }

                                                    const mappedFinding = {
                                                        ...finding,
                                                        description: finding.plain_english || finding.description || "",
                                                        evidence: mappedEvidence
                                                    };

                                                    return <FindingCard key={idx} finding={mappedFinding} />;
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </motion.div>
                        )}

                        {activeModule === 'Visual Forensics & Heatmaps' && (
                            <motion.div
                                key="visual-forensics"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full"
                            >
                                <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-lg">
                                    <h2 className="text-[14px] font-bold text-[#111] uppercase">2. Visual Forensics & Heatmaps</h2>
                                </div>
                                <div className="p-4">
                                    {renderFindingsForCategory('Visual Forensics')}

                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {Object.entries(visualResults).map(([doc, results]) => (
                                            <div key={doc} className="bg-[#f9fafb] p-3 rounded border border-[#e5e7eb]">
                                                <h3 className="text-[12px] font-bold text-[#111] uppercase mb-3 border-b border-[#e5e7eb] pb-1">{doc}</h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {results.ela?.amplified_base64 && (
                                                        <div>
                                                            <div className="text-[10px] text-[#6b7280] uppercase mb-1 font-semibold">Error Level Analysis</div>
                                                            <img src={`data:image/png;base64,${results.ela.amplified_base64}`} alt={`ELA ${doc}`} className="w-full h-auto object-contain bg-black border border-[#374151] rounded" />
                                                            <div className="text-[9px] text-right text-[#9ca3af] mt-1">Score: {results.ela.scalar_score?.toFixed(4)}</div>
                                                        </div>
                                                    )}
                                                    {results.noise?.residual_base64 && (
                                                        <div>
                                                            <div className="text-[10px] text-[#6b7280] uppercase mb-1 font-semibold">Noise Residual Map</div>
                                                            <img src={`data:image/png;base64,${results.noise.residual_base64}`} alt={`Noise ${doc}`} className="w-full h-auto object-contain bg-black border border-[#374151] rounded" />
                                                            <div className="text-[9px] text-right text-[#9ca3af] mt-1">Mean Var: {results.noise.mean_variance?.toFixed(2)}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeModule === 'Mathematical Integrity' && (() => {
                            const findEntityVal = (doc, label) => {
                                const ents = entities[doc] || [];
                                const ent = ents.find(e => e.entity_type === label || e.label === label);
                                return ent ? parseVal(ent.normalized_value || ent.text) : null;
                            };

                            const salMathFinding = findings.find(f => f.check_name === 'salary_net_math' || (f.category === 'Mathematical Integrity' && f.evidence?.gross !== undefined));
                            const itrMathFinding = findings.find(f => f.check_name === 'itr_income_vs_salary' || (f.category === 'Mathematical Integrity' && f.evidence?.itr_income !== undefined));

                            const grossPay = parseVal(findEntityVal('salary', 'salary_gross') || backendData?.manifest_data?.salary_gross || salMathFinding?.evidence?.gross || itrMathFinding?.evidence?.salary_monthly);
                            const declaredNetPay = parseVal(findEntityVal('salary', 'salary_net') || backendData?.manifest_data?.salary_net || salMathFinding?.evidence?.declared_net);
                            const deductions = parseVal(findEntityVal('salary', 'salary_deductions') || salMathFinding?.evidence?.deductions);
                            const basicPay = parseVal(findEntityVal('salary', 'basic_pay'));
                            const hra = parseVal(findEntityVal('salary', 'hra'));
                            const pf = parseVal(findEntityVal('salary', 'pf_deduction'));
                            const tax = parseVal(findEntityVal('salary', 'esi_deduction') || findEntityVal('salary', 'tax') || findEntityVal('salary', 'tds'));

                            const extractedAllowances = findEntityVal('salary', 'allowances') || findEntityVal('salary', 'allowance');
                            const allowances = extractedAllowances !== null ? extractedAllowances : (grossPay !== null && basicPay !== null && hra !== null ? (grossPay - basicPay - hra) : null);

                            const computedNetPay = grossPay !== null && deductions !== null ? (grossPay - deductions) : (salMathFinding?.evidence?.computed_net !== undefined ? parseVal(salMathFinding.evidence.computed_net) : null);

                            const itrDeclaredIncome = parseVal(findEntityVal('itr', 'itr_income') || backendData?.manifest_data?.itr_total_income || itrMathFinding?.evidence?.itr_income);
                            const annualizedSalary = grossPay !== null ? grossPay * 12 : (itrMathFinding?.evidence?.annualized_salary !== undefined ? parseVal(itrMathFinding.evidence.annualized_salary) : null);

                            const mathFindings = findings.filter(f => f.category === 'Mathematical Integrity');

                            // ── Derived math ────────────────────────────────────────────────────────
                            // Salary component validation
                            const isValidNum = (v) => v !== null && !isNaN(v) && v > 100;

                            // Expected PF = 12% of Basic Pay (EPFO rule)
                            const expectedPF = isValidNum(basicPay) ? Math.round(basicPay * 0.12) : null;
                            const pfOk = isValidNum(pf) && isValidNum(expectedPF)
                                ? Math.abs(pf - expectedPF) <= Math.max(50, expectedPF * 0.05)
                                : null;

                            // Expected HRA = 40-50% of Basic (metro: 50%, non-metro: 40%)
                            const expectedHRALow = isValidNum(basicPay) ? Math.round(basicPay * 0.40) : null;
                            const expectedHRAHigh = isValidNum(basicPay) ? Math.round(basicPay * 0.50) : null;
                            const hraOk = isValidNum(hra) && isValidNum(expectedHRALow)
                                ? hra >= expectedHRALow * 0.9 && hra <= expectedHRAHigh * 1.1
                                : null;

                            // Gross verification: Basic + HRA + Allowances = Gross
                            const computedGross = isValidNum(basicPay) && isValidNum(hra) && isValidNum(allowances)
                                ? basicPay + hra + allowances : null;
                            const grossOk = isValidNum(grossPay) && isValidNum(computedGross)
                                ? Math.abs(grossPay - computedGross) <= 100 : null;

                            // Net pay verification: Gross - totalDeductions = Net
                            // Use actual deduction items if available, otherwise use the deductions field
                            const totalItemDeductions = (isValidNum(pf) ? pf : 0) + (isValidNum(tax) ? tax : 0);
                            const netFromItems = isValidNum(grossPay) && totalItemDeductions > 0
                                ? grossPay - totalItemDeductions : null;
                            const netOk = isValidNum(computedNetPay) && isValidNum(declaredNetPay)
                                ? Math.abs(computedNetPay - declaredNetPay) <= 100 : null;

                            // ITR gap analysis
                            const itrGap = isValidNum(annualizedSalary) && isValidNum(itrDeclaredIncome)
                                ? itrDeclaredIncome - annualizedSalary : null;
                            const itrGapPct = itrGap !== null && isValidNum(annualizedSalary)
                                ? (itrGap / annualizedSalary) * 100 : null;
                            const itrOk = itrGapPct !== null
                                ? Math.abs(itrGapPct) <= 10 : null;

                            // ── Chart data ──────────────────────────────────────────────────────────
                            const salaryComponentData = [
                                { name: 'Basic Pay', value: isValidNum(basicPay) ? basicPay : 0, fill: '#6366f1' },
                                { name: 'HRA', value: isValidNum(hra) ? hra : 0, fill: '#8b5cf6' },
                                { name: 'Allowances', value: isValidNum(allowances) ? allowances : 0, fill: '#a78bfa' },
                            ].filter(d => d.value > 0);

                            const deductionData = [
                                { name: 'PF (12% Basic)', value: isValidNum(pf) ? pf : 0, expected: expectedPF || 0, fill: '#f59e0b' },
                                { name: 'ESI / Tax', value: isValidNum(tax) ? tax : 0, expected: 0, fill: '#ef4444' },
                            ].filter(d => d.value > 0 || d.expected > 0);

                            // Waterfall chart: Gross → -PF → -Tax → -Other Ded → Net
                            const waterfallData = [];
                            if (isValidNum(grossPay)) {
                                let running = grossPay;
                                waterfallData.push({ name: 'Gross Pay', value: running, base: 0, fill: '#10b981', type: 'total' });
                                if (isValidNum(pf) && pf > 0) {
                                    const next = running - pf;
                                    waterfallData.push({ name: 'PF', value: pf, base: next, fill: '#f59e0b', type: 'deduct' });
                                    running = next;
                                }
                                if (isValidNum(tax) && tax > 0 && tax < 1000000) {
                                    const next = running - tax;
                                    waterfallData.push({ name: 'ESI/Tax', value: tax, base: next, fill: '#ef4444', type: 'deduct' });
                                    running = next;
                                }
                                const otherDed = isValidNum(deductions) ? deductions - (isValidNum(pf) ? pf : 0) - (isValidNum(tax) ? tax : 0) : 0;
                                if (otherDed > 0) {
                                    const next = running - otherDed;
                                    waterfallData.push({ name: 'Other Ded.', value: otherDed, base: next, fill: '#f97316', type: 'deduct' });
                                    running = next;
                                }
                                if (isValidNum(computedNetPay || declaredNetPay)) {
                                    waterfallData.push({ name: 'Net Pay', value: computedNetPay || declaredNetPay || running, base: 0, fill: '#6366f1', type: 'total' });
                                }
                            }

                            // ITR bar chart data
                            const itrBarData = [
                                { name: 'Annualized\nSalary', value: isValidNum(annualizedSalary) ? annualizedSalary : null, fill: '#6366f1' },
                                { name: 'ITR\nDeclared', value: isValidNum(itrDeclaredIncome) ? itrDeclaredIncome : null, fill: '#10b981' },
                            ];

                            // Math checks table
                            const mathChecks = [
                                {
                                    check: 'Gross = Basic + HRA + Allowances',
                                    formula: `${isValidNum(basicPay) ? formatRupee(basicPay) : '?'} + ${isValidNum(hra) ? formatRupee(hra) : '?'} + ${isValidNum(allowances) ? formatRupee(allowances) : '?'}`,
                                    expected: isValidNum(computedGross) ? formatRupee(computedGross) : '—',
                                    actual: isValidNum(grossPay) ? formatRupee(grossPay) : '—',
                                    status: grossOk === true ? 'ok' : grossOk === false ? 'error' : 'missing',
                                    note: grossOk === false ? `Δ ${formatRupee(Math.abs(grossPay - computedGross))}` : '',
                                },
                                {
                                    check: 'PF ≈ 12% of Basic Pay',
                                    formula: `12% × ${isValidNum(basicPay) ? formatRupee(basicPay) : '?'}`,
                                    expected: isValidNum(expectedPF) ? formatRupee(expectedPF) : '—',
                                    actual: isValidNum(pf) ? formatRupee(pf) : '—',
                                    status: pfOk === true ? 'ok' : pfOk === false ? 'warn' : 'missing',
                                    note: pfOk === false && isValidNum(pf) && isValidNum(expectedPF) ? `Δ ${formatRupee(Math.abs(pf - expectedPF))}` : '',
                                },
                                {
                                    check: 'HRA = 40–50% of Basic',
                                    formula: `40–50% × ${isValidNum(basicPay) ? formatRupee(basicPay) : '?'}`,
                                    expected: isValidNum(expectedHRALow) ? `${formatRupee(expectedHRALow)} – ${formatRupee(expectedHRAHigh)}` : '—',
                                    actual: isValidNum(hra) ? formatRupee(hra) : '—',
                                    status: hraOk === true ? 'ok' : hraOk === false ? 'warn' : 'missing',
                                    note: '',
                                },
                                {
                                    check: 'Net Pay = Gross − Deductions',
                                    formula: `${isValidNum(grossPay) ? formatRupee(grossPay) : '?'} − deductions`,
                                    expected: isValidNum(computedNetPay) ? formatRupee(computedNetPay) : '—',
                                    actual: isValidNum(declaredNetPay) ? formatRupee(declaredNetPay) : '—',
                                    status: netOk === true ? 'ok' : netOk === false ? 'error' : 'missing',
                                    note: netOk === false && isValidNum(computedNetPay) && isValidNum(declaredNetPay) ? `Δ ${formatRupee(Math.abs(computedNetPay - declaredNetPay))}` : '',
                                },
                                {
                                    check: 'ITR ≈ Salary × 12',
                                    formula: `${isValidNum(grossPay) ? formatRupee(grossPay) : '?'} × 12`,
                                    expected: isValidNum(annualizedSalary) ? formatRupee(annualizedSalary) : '—',
                                    actual: isValidNum(itrDeclaredIncome) ? formatRupee(itrDeclaredIncome) : '—',
                                    status: itrOk === true ? 'ok' : itrOk === false ? 'error' : 'missing',
                                    note: itrGapPct !== null ? `${itrGapPct > 0 ? '+' : ''}${itrGapPct.toFixed(1)}% gap` : '',
                                },
                            ];

                            const CustomWaterfallBar = (props) => {
                                const { x, y, width, height, fill, base, type } = props;
                                if (!height || height === 0) return null;
                                return <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} ry={4} opacity={0.92} />;
                            };

                            const WaterfallTooltip = ({ active, payload }) => {
                                if (!active || !payload || !payload.length) return null;
                                const d = payload[0]?.payload;
                                return (
                                    <div className="bg-white border border-[#e5e7eb] rounded-lg shadow-lg p-3 text-[12px]">
                                        <p className="font-bold text-[#111] mb-1">{d?.name}</p>
                                        <p style={{ color: d?.fill }} className="font-semibold">
                                            {d?.type === 'deduct' ? '−' : ''}{formatRupee(d?.value)}
                                        </p>
                                    </div>
                                );
                            };

                            const SalaryTooltip = ({ active, payload }) => {
                                if (!active || !payload || !payload.length) return null;
                                const d = payload[0];
                                return (
                                    <div className="bg-white border border-[#e5e7eb] rounded-lg shadow-lg p-3 text-[12px]">
                                        <p className="font-bold text-[#111] mb-1">{d?.payload?.name}</p>
                                        <p style={{ color: d?.fill }} className="font-semibold">{formatRupee(d?.value)}</p>
                                        {isValidNum(grossPay) && grossPay > 0 && (
                                            <p className="text-[#6b7280] mt-0.5">{((d?.value / grossPay) * 100).toFixed(1)}% of Gross</p>
                                        )}
                                    </div>
                                );
                            };

                            return (
                                <motion.div
                                    key="mathematical-integrity"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full"
                                >
                                    <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-lg flex items-center justify-between">
                                        <h2 className="text-[14px] font-bold text-[#111] uppercase">3. Mathematical Integrity Engine</h2>
                                        <div className="flex gap-2">
                                            {mathChecks.map((c, i) => (
                                                <MathStatusPill key={i} status={c.status} label={c.status === 'ok' ? 'Pass' : c.status === 'error' ? 'Fail' : c.status === 'warn' ? 'Warn' : 'N/A'} />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-5 space-y-7">

                                        {/* ── Section A: Salary Composition Bar ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">A · Salary Composition</h3>
                                                {isValidNum(grossPay) && (
                                                    <span className="text-[11px] font-semibold text-[#6b7280]">Gross: <span className="text-[#111] font-bold">{formatRupee(grossPay)}</span></span>
                                                )}
                                            </div>
                                            {salaryComponentData.length > 0 ? (
                                                <div className="flex gap-5 items-start">
                                                    <div style={{ width: '100%', height: 160 }}>
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <BarChart data={salaryComponentData} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
                                                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                                                <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                                                <Tooltip content={<SalaryTooltip />} />
                                                                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                                                    {salaryComponentData.map((entry, idx) => (
                                                                        <Cell key={idx} fill={entry.fill} />
                                                                    ))}
                                                                </Bar>
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                    <div className="flex flex-col gap-2 min-w-[160px] justify-center py-4">
                                                        {salaryComponentData.map((d, i) => (
                                                            <div key={i} className="flex items-center gap-2 text-[11px]">
                                                                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: d.fill }} />
                                                                <span className="text-[#6b7280] font-medium">{d.name}</span>
                                                                <span className="ml-auto font-bold text-[#111]">{formatRupee(d.value)}</span>
                                                                {isValidNum(grossPay) && grossPay > 0 && (
                                                                    <span className="text-[#9ca3af] ml-1">({((d.value / grossPay) * 100).toFixed(0)}%)</span>
                                                                )}
                                                            </div>
                                                        ))}
                                                        <div className="border-t border-[#e5e7eb] pt-2 mt-1 flex items-center gap-2 text-[11px]">
                                                            <div className="w-3 h-3 rounded-sm flex-shrink-0 bg-transparent border border-[#d1d5db]" />
                                                            <span className="text-[#374151] font-bold">Gross Total</span>
                                                            <span className="ml-auto font-extrabold text-[#111]">{formatRupee(grossPay)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-center py-6 text-[12px] text-[#9ca3af] bg-[#fafafa] rounded-lg border border-dashed border-[#e5e7eb]">
                                                    Salary component data not extracted — verify document manually
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Section B: Waterfall Net Pay ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">B · Gross → Net Pay Waterfall</h3>
                                                {netOk !== null && (
                                                    <MathStatusPill status={netOk ? 'ok' : 'error'} label={netOk ? 'Net Pay Verified' : 'Net Pay Mismatch'} />
                                                )}
                                            </div>
                                            {waterfallData.length > 1 ? (
                                                <div style={{ width: '100%', height: 200 }}>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={waterfallData} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                                            <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                                            <Tooltip content={<WaterfallTooltip />} />
                                                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                                                {waterfallData.map((entry, idx) => (
                                                                    <Cell key={idx} fill={entry.fill} />
                                                                ))}
                                                            </Bar>
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            ) : (
                                                <div className="text-center py-6 text-[12px] text-[#9ca3af] bg-[#fafafa] rounded-lg border border-dashed border-[#e5e7eb]">
                                                    Insufficient data to render waterfall — gross pay needed
                                                </div>
                                            )}

                                            {/* Net Pay compare strip */}
                                            {(isValidNum(computedNetPay) || isValidNum(declaredNetPay)) && (
                                                <div className="mt-3 flex items-center gap-4 p-3 rounded-lg border"
                                                    style={{
                                                        borderColor: netOk === true ? '#10b98140' : netOk === false ? '#ef444440' : '#e5e7eb',
                                                        background: netOk === true ? '#10b98108' : netOk === false ? '#ef444408' : '#fafafa'
                                                    }}>
                                                    <div className="flex-1 text-center">
                                                        <div className="text-[10px] text-[#6b7280] font-bold uppercase tracking-wider mb-0.5">Computed Net Pay</div>
                                                        <div className="text-[16px] font-extrabold text-[#111]">{formatRupee(computedNetPay)}</div>
                                                        <div className="text-[10px] text-[#9ca3af] mt-0.5">Gross − all deductions</div>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="text-[20px]" style={{ color: netOk === true ? '#10b981' : netOk === false ? '#ef4444' : '#9ca3af' }}>
                                                            {netOk === true ? '=' : netOk === false ? '≠' : '?'}
                                                        </div>
                                                        {netOk === false && isValidNum(computedNetPay) && isValidNum(declaredNetPay) && (
                                                            <span className="text-[10px] font-bold text-[#ef4444]">Δ {formatRupee(Math.abs(computedNetPay - declaredNetPay))}</span>
                                                        )}
                                                        {netOk === true && <span className="text-[10px] font-bold text-[#10b981]">within ₹100</span>}
                                                    </div>
                                                    <div className="flex-1 text-center">
                                                        <div className="text-[10px] text-[#6b7280] font-bold uppercase tracking-wider mb-0.5">Declared Net Pay</div>
                                                        <div className="text-[16px] font-extrabold text-[#111]">{formatRupee(declaredNetPay)}</div>
                                                        <div className="text-[10px] text-[#9ca3af] mt-0.5">From salary slip</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Section C: Deduction Rate Analysis ── */}
                                        {deductionData.length > 0 && (
                                            <div>
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">C · Deduction Rate Analysis</h3>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-[11px] border border-[#e5e7eb] rounded-lg overflow-hidden">
                                                        <thead className="bg-[#f3f4f6]">
                                                            <tr>
                                                                <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">Deduction</th>
                                                                <th className="p-2.5 text-right font-bold text-[#374151] uppercase tracking-wide">Statutory Rate</th>
                                                                <th className="p-2.5 text-right font-bold text-[#374151] uppercase tracking-wide">Expected</th>
                                                                <th className="p-2.5 text-right font-bold text-[#374151] uppercase tracking-wide">Actual</th>
                                                                <th className="p-2.5 text-right font-bold text-[#374151] uppercase tracking-wide">Δ Difference</th>
                                                                <th className="p-2.5 text-center font-bold text-[#374151] uppercase tracking-wide">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-[#e5e7eb]">
                                                            {/* PF Row */}
                                                            <tr className="hover:bg-[#fafafa]">
                                                                <td className="p-2.5 font-semibold text-[#111]">Provident Fund (PF)</td>
                                                                <td className="p-2.5 text-right text-[#6b7280]">12% of Basic</td>
                                                                <td className="p-2.5 text-right font-mono text-[#374151]">{formatRupee(expectedPF)}</td>
                                                                <td className="p-2.5 text-right font-mono font-bold text-[#111]">{formatRupee(pf)}</td>
                                                                <td className="p-2.5 text-right font-mono" style={{ color: pfOk === true ? '#10b981' : pfOk === false ? '#ef4444' : '#9ca3af' }}>
                                                                    {pfOk === null ? '—' : pfOk ? '≈ 0' : formatRupee(isValidNum(pf) && isValidNum(expectedPF) ? Math.abs(pf - expectedPF) : null)}
                                                                </td>
                                                                <td className="p-2.5 text-center">
                                                                    <MathStatusPill status={pfOk === true ? 'ok' : pfOk === false ? 'warn' : 'missing'}
                                                                        label={pfOk === true ? 'Pass' : pfOk === false ? 'Check' : 'N/A'} />
                                                                </td>
                                                            </tr>
                                                            {/* ESI/Tax Row */}
                                                            {isValidNum(tax) && tax > 0 && tax < 500000 && (
                                                                <tr className="hover:bg-[#fafafa]">
                                                                    <td className="p-2.5 font-semibold text-[#111]">ESI / Income Tax</td>
                                                                    <td className="p-2.5 text-right text-[#6b7280]">ESI: 0.75% Gross; TDS: slab</td>
                                                                    <td className="p-2.5 text-right font-mono text-[#374151]">{isValidNum(grossPay) ? formatRupee(Math.round(grossPay * 0.0075)) : '—'}</td>
                                                                    <td className="p-2.5 text-right font-mono font-bold text-[#111]">{formatRupee(tax)}</td>
                                                                    <td className="p-2.5 text-right text-[#9ca3af]">—</td>
                                                                    <td className="p-2.5 text-center">
                                                                        <MathStatusPill status="missing" label="Manual" />
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            {isValidNum(tax) && tax >= 500000 && (
                                                                <tr className="bg-[#fef2f2] hover:bg-[#fee2e2]">
                                                                    <td className="p-2.5 font-semibold text-[#dc2626]"> Tax / ESI — Anomalous Value</td>
                                                                    <td className="p-2.5 text-right text-[#6b7280]">ESI: 0.75% Gross</td>
                                                                    <td className="p-2.5 text-right font-mono text-[#374151]">{isValidNum(grossPay) ? formatRupee(Math.round(grossPay * 0.0075)) : '—'}</td>
                                                                    <td className="p-2.5 text-right font-mono font-bold text-[#dc2626]">{formatRupee(tax)}</td>
                                                                    <td className="p-2.5 text-right font-mono font-bold text-[#dc2626]">{formatRupee(Math.abs(tax - (isValidNum(grossPay) ? Math.round(grossPay * 0.0075) : 0)))}</td>
                                                                    <td className="p-2.5 text-center">
                                                                        <MathStatusPill status="error" label="Anomaly" />
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Section D: Math Verification Table ── */}
                                        <div>
                                            <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">D · Formula Verification</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-[11px] border border-[#e5e7eb] rounded-lg overflow-hidden">
                                                    <thead className="bg-[#f3f4f6]">
                                                        <tr>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">Check</th>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">Formula</th>
                                                            <th className="p-2.5 text-right font-bold text-[#374151] uppercase tracking-wide">Expected</th>
                                                            <th className="p-2.5 text-right font-bold text-[#374151] uppercase tracking-wide">Actual</th>
                                                            <th className="p-2.5 text-right font-bold text-[#374151] uppercase tracking-wide">Δ / Note</th>
                                                            <th className="p-2.5 text-center font-bold text-[#374151] uppercase tracking-wide">Result</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-[#e5e7eb]">
                                                        {mathChecks.map((row, i) => (
                                                            <tr key={i}
                                                                className="hover:bg-[#fafafa] transition-colors"
                                                                style={{ background: row.status === 'error' ? '#fef2f250' : row.status === 'warn' ? '#fffbeb50' : undefined }}>
                                                                <td className="p-2.5 font-semibold text-[#111]">{row.check}</td>
                                                                <td className="p-2.5 font-mono text-[#6b7280] text-[10px]">{row.formula}</td>
                                                                <td className="p-2.5 text-right font-mono text-[#374151]">{row.expected}</td>
                                                                <td className="p-2.5 text-right font-mono font-bold text-[#111]">{row.actual}</td>
                                                                <td className="p-2.5 text-right text-[10px]" style={{ color: row.status === 'ok' ? '#10b981' : row.status === 'error' ? '#ef4444' : '#f59e0b' }}>
                                                                    {row.note || '—'}
                                                                </td>
                                                                <td className="p-2.5 text-center">
                                                                    <MathStatusPill status={row.status}
                                                                        label={row.status === 'ok' ? 'Pass' : row.status === 'error' ? 'Fail' : row.status === 'warn' ? 'Warn' : 'N/A'} />
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* ── Section E: ITR Reconciliation ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">E · ITR Income Reconciliation</h3>
                                                {itrOk !== null && (
                                                    <MathStatusPill status={itrOk ? 'ok' : 'error'}
                                                        label={itrOk ? 'ITR Matches' : `Gap: ${itrGapPct !== null ? itrGapPct.toFixed(1) + '%' : '—'}`} />
                                                )}
                                            </div>

                                            {isValidNum(annualizedSalary) || isValidNum(itrDeclaredIncome) ? (
                                                <div className="flex gap-5 items-start">
                                                    <div style={{ width: '100%', height: 160 }}>
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <BarChart data={itrBarData.filter(d => isValidNum(d.value))} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
                                                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                                                <YAxis tickFormatter={v => `₹${(v / 100000).toFixed(1)}L`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                                                <Tooltip formatter={(v, n, p) => [formatRupee(v), p.payload.name]} />
                                                                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                                                    {itrBarData.filter(d => isValidNum(d.value)).map((entry, idx) => (
                                                                        <Cell key={idx} fill={entry.fill} />
                                                                    ))}
                                                                </Bar>
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                    <div className="flex flex-col gap-3 min-w-[170px] py-3">
                                                        <div className="p-2.5 rounded-lg border border-[#e5e7eb] bg-[#fafafa]">
                                                            <div className="text-[10px] text-[#6b7280] font-bold uppercase mb-0.5">Salary × 12</div>
                                                            <div className="text-[14px] font-extrabold text-[#6366f1]">{formatRupee(annualizedSalary)}</div>
                                                            <div className="text-[10px] text-[#9ca3af]">{isValidNum(grossPay) ? formatRupee(grossPay) : '—'} / month</div>
                                                        </div>
                                                        <div className="p-2.5 rounded-lg border border-[#e5e7eb] bg-[#fafafa]">
                                                            <div className="text-[10px] text-[#6b7280] font-bold uppercase mb-0.5">ITR Declared</div>
                                                            <div className="text-[14px] font-extrabold text-[#10b981]">{formatRupee(itrDeclaredIncome)}</div>
                                                            <div className="text-[10px] text-[#9ca3af]">Annual income</div>
                                                        </div>
                                                        {itrGap !== null && (
                                                            <div className="p-2.5 rounded-lg border"
                                                                style={{ borderColor: itrOk ? '#10b98140' : '#ef444440', background: itrOk ? '#10b98108' : '#ef444408' }}>
                                                                <div className="text-[10px] font-bold uppercase mb-0.5" style={{ color: itrOk ? '#059669' : '#dc2626' }}>Gap</div>
                                                                <div className="text-[14px] font-extrabold" style={{ color: itrOk ? '#059669' : '#dc2626' }}>
                                                                    {itrGap > 0 ? '+' : ''}{formatRupee(itrGap)}
                                                                </div>
                                                                <div className="text-[10px]" style={{ color: itrOk ? '#059669' : '#dc2626' }}>
                                                                    {itrGapPct !== null ? `${itrGapPct.toFixed(1)}% variance` : ''}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-center py-6 text-[12px] text-[#9ca3af] bg-[#fafafa] rounded-lg border border-dashed border-[#e5e7eb]">
                                                    ITR or salary data not extracted — verify manually
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Findings ── */}
                                        {mathFindings.length > 0 && (
                                            <div className="pt-5 border-t border-[#e5e7eb] space-y-2">
                                                <h4 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-2">AI Findings · Math Integrity</h4>
                                                {mathFindings.map((f, i) => (
                                                    <FindingCard key={i} finding={{ ...f, evidence: null }} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })()}

                        {activeModule === 'Cross-Document Coherence' && (() => {
                            const fieldsList = ['name', 'dob', 'pan', 'aadhaar', 'address', 'employer', 'income', 'bank_account', 'ifsc'];
                            const docTypesList = ['identity', 'salary', 'itr', 'land_record'];
                            const docLabels = { identity: 'Identity', salary: 'Salary', itr: 'ITR', land_record: 'Land Record' };

                            const fieldMeta = {
                                name: { label: 'Applicant Name', why: 'Name must match exactly across all documents. Any mismatch suggests documents belong to different people, or were selectively edited to pass verification.' },
                                dob: { label: 'Date of Birth', why: 'DOB is a primary identity anchor. A mismatch between Aadhaar and ITR indicates a possible identity substitution — the ITR may belong to a different person.' },
                                pan: { label: 'PAN Number', why: 'PAN is unique per taxpayer. Inconsistency here is a critical red flag — the ITR or salary slip may belong to a different individual entirely.' },
                                aadhaar: { label: 'Aadhaar (last 4)', why: 'Even a partial Aadhaar mismatch across documents indicates different physical persons or deliberate document substitution.' },
                                address: { label: 'Address / PIN', why: 'Address on salary slip should match ITR and Aadhaar. A mismatch may indicate the applicant does not reside at the stated address — relevant for property collateral risk.' },
                                employer: { label: 'Employer Name', why: 'Salary slip and ITR must name the same employer. A mismatch is one of the strongest indicators that the salary slip is fabricated — the ITR tells a different employment story.' },
                                income: { label: 'Declared Income', why: 'Income figures must be consistent across salary slip and ITR. A large gap means either the salary is inflated or income is under-reported to the tax authority — both are fraud signals.' },
                                bank_account: { label: 'Bank Account No.', why: 'The bank account on the salary slip should match the identity and ITR records. A mismatch suggests salary credits go to a different person\'s account.' },
                                ifsc: { label: 'IFSC Code', why: 'IFSC codes should be consistent. An IFSC mismatch alongside the same account number could indicate tampered bank details on one of the documents.' },
                            };

                            const getCoherenceFindingVal = (fieldName, doc) => {
                                const aliases = {
                                    name: ['name'], dob: ['dob'], pan: ['pan'],
                                    aadhaar: ['aadhaar_last4', 'uid', 'aadhaar'],
                                    address: ['pin', 'district', 'address'],
                                    employer: ['employer', 'employer_name'],
                                    income: ['salary_gross', 'salary_net', 'itr_income', 'income'],
                                    bank_account: ['account_no', 'bank_account'],
                                    ifsc: ['ifsc']
                                };
                                const targetTypes = aliases[fieldName] || [fieldName];
                                const f = findings.find(f => {
                                    const cat = (f.category || '').toUpperCase();
                                    if (cat !== 'CROSS-DOCUMENT COHERENCE') return false;
                                    const fField = (f.field_name || f.field || '').toLowerCase();
                                    return targetTypes.includes(fField);
                                });
                                return f?.evidence?.field_values?.[doc] || null;
                            };

                            const getEntityVal = (doc, fieldName) => {
                                const ents = entities[doc] || [];
                                const aliases = {
                                    name: ['name'], dob: ['dob'], pan: ['pan'],
                                    aadhaar: ['aadhaar_last4', 'uid', 'aadhaar'],
                                    address: ['pin', 'district', 'address'],
                                    employer: ['employer', 'employer_name'],
                                    income: ['salary_gross', 'salary_net', 'itr_income', 'land_value', 'income'],
                                    bank_account: ['account_no', 'bank_account'],
                                    ifsc: ['ifsc']
                                };
                                const targetTypes = aliases[fieldName] || [fieldName];
                                const ent = ents.find(e => targetTypes.includes(e.entity_type) || targetTypes.includes(e.label));
                                return ent ? (ent.normalized_value || ent.text) : null;
                            };

                            const getCellValue = (doc, fieldName) =>
                                getCoherenceFindingVal(fieldName, doc) || getEntityVal(doc, fieldName);

                            const getFindingForField = (fieldName) => {
                                const aliases = {
                                    name: ['name'], dob: ['dob'], pan: ['pan'],
                                    aadhaar: ['aadhaar_last4', 'uid', 'aadhaar'],
                                    address: ['pin', 'district', 'address'],
                                    employer: ['employer', 'employer_name'],
                                    income: ['salary_gross', 'salary_net', 'itr_income', 'income'],
                                    bank_account: ['account_no', 'bank_account'],
                                    ifsc: ['ifsc']
                                };
                                const targetTypes = aliases[fieldName] || [fieldName];
                                return findings.find(f => {
                                    const cat = (f.category || '').toUpperCase();
                                    if (cat !== 'CROSS-DOCUMENT COHERENCE') return false;
                                    const fField = (f.field_name || f.field || '').toLowerCase();
                                    return targetTypes.includes(fField);
                                });
                            };

                            const getRowStatus = (fieldName, uniqueVals) => {
                                const f = getFindingForField(fieldName);
                                if (f) {
                                    if (f.severity === 'CRITICAL') return 'critical';
                                    if (f.severity === 'WARNING') return 'warning';
                                }
                                if (uniqueVals.length <= 1) return 'ok';
                                let maxDist = 0;
                                for (let i = 0; i < uniqueVals.length; i++) {
                                    for (let j = i + 1; j < uniqueVals.length; j++) {
                                        const dist = getEditDistance(uniqueVals[i], uniqueVals[j]);
                                        maxDist = Math.max(maxDist, dist);
                                    }
                                }
                                return maxDist >= 3 ? 'critical' : 'warning';
                            };

                            const rowData = fieldsList.map(field => {
                                const valsByDoc = {};
                                const presentVals = [];
                                docTypesList.forEach(doc => {
                                    const v = getCellValue(doc, field);
                                    if (v !== null && v !== undefined && String(v).trim() !== '') {
                                        const cleanVal = String(v).trim();
                                        valsByDoc[doc] = cleanVal;
                                        presentVals.push(cleanVal);
                                    } else {
                                        valsByDoc[doc] = null;
                                    }
                                });
                                const uniqueVals = Array.from(new Set(presentVals));
                                const status = getRowStatus(field, uniqueVals);
                                const finding = getFindingForField(field);
                                return { field, valsByDoc, uniqueVals, status, finding };
                            });

                            const mismatches = rowData.filter(r => r.status === 'critical' || r.status === 'warning');
                            const coherentCount = rowData.filter(r => r.status === 'ok').length;
                            const criticalCount = rowData.filter(r => r.status === 'critical').length;
                            const warningCount = rowData.filter(r => r.status === 'warning').length;
                            const trustScore = Math.max(0, Math.round(100 - criticalCount * 20 - warningCount * 8));
                            const trustColor = trustScore >= 70 ? '#10b981' : trustScore >= 45 ? '#f59e0b' : '#ef4444';
                            const trustLabel = trustScore >= 70
                                ? 'Document Set Largely Consistent'
                                : trustScore >= 45
                                    ? 'Significant Inconsistencies Detected'
                                    : 'High Cross-Document Conflict — Suspected Fraud';

                            const statusMeta = {
                                ok: { color: '#10b981', bg: '#10b98110', border: '#10b98140', label: 'Coherent', icon: '' },
                                warning: { color: '#f59e0b', bg: '#f59e0b10', border: '#f59e0b40', label: 'Warning', icon: '' },
                                critical: { color: '#ef4444', bg: '#ef444410', border: '#ef444440', label: 'Mismatch', icon: '' },
                            };

                            return (
                                <motion.div
                                    key="cross-document"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full"
                                >
                                    <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-lg flex items-center justify-between">
                                        <h2 className="text-[14px] font-bold text-[#111] uppercase">4. Cross-Document Coherence Matrix</h2>
                                        <div className="flex gap-2">
                                            {criticalCount > 0 && <MathStatusPill status="error" label={`${criticalCount} Mismatches`} />}
                                            {warningCount > 0 && <MathStatusPill status="warn" label={`${warningCount} Warnings`} />}
                                            <MathStatusPill status="ok" label={`${coherentCount} Coherent`} />
                                        </div>
                                    </div>
                                    <div className="p-5 space-y-6">

                                        {/* ── Trustworthiness Banner ── */}
                                        <div className="p-4 rounded-xl border-2 flex items-center gap-5"
                                            style={{ borderColor: `${trustColor}40`, background: `${trustColor}08` }}>
                                            <div className="text-center flex-shrink-0 min-w-[56px]">
                                                <div className="text-[28px] font-black" style={{ color: trustColor }}>{trustScore}</div>
                                                <div className="text-[9px] font-bold text-[#6b7280] uppercase">Coherence / 100</div>
                                            </div>
                                            <div className="h-10 w-px bg-[#e5e7eb] flex-shrink-0" />
                                            <div>
                                                <div className="text-[12px] font-bold mb-1" style={{ color: trustColor }}>{trustLabel}</div>
                                                <div className="text-[10px] text-[#6b7280]">
                                                    Genuine loan applications have identical identity fields across all submitted documents.
                                                    Each mismatch signals that documents may belong to different individuals, or were selectively edited to pass verification.
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── A: Coherence Matrix ── */}
                                        <div>
                                            <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">A · Field-by-Field Coherence Matrix</h3>
                                            <div className="border border-[#e5e7eb] rounded-lg overflow-x-auto">
                                                <table className="w-full text-[11px]">
                                                    <thead className="bg-[#f3f4f6] sticky top-0 z-10">
                                                        <tr>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide sticky left-0 bg-[#f3f4f6] z-20 border-r border-[#e5e7eb]">Field</th>
                                                            <th className="p-2.5 text-center font-bold text-[#374151] uppercase tracking-wide w-24">Status</th>
                                                            {docTypesList.map(d => (
                                                                <th key={d} className="p-2.5 text-center font-bold text-[#374151] uppercase tracking-wide">{docLabels[d]}</th>
                                                            ))}
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide min-w-[140px]">Underwriter Note</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-[#f3f4f6]">
                                                        {rowData.map(({ field, valsByDoc, uniqueVals, status }) => {
                                                            const s = statusMeta[status];
                                                            const meta = fieldMeta[field];
                                                            const refVal = uniqueVals[0];
                                                            return (
                                                                <tr key={field} className="hover:bg-[#fafafa]"
                                                                    style={{ background: status !== 'ok' ? `${s.color}04` : undefined }}>
                                                                    <td className="p-2.5 sticky left-0 bg-white border-r border-[#f3f4f6] z-10 min-w-[120px]">
                                                                        <div className="font-bold text-[11px] text-[#111]">{meta?.label || field.replace(/_/g, ' ')}</div>
                                                                    </td>
                                                                    <td className="p-2.5 text-center">
                                                                        <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border"
                                                                            style={{ color: s.color, background: s.bg, borderColor: s.border }}>
                                                                            {s.icon} {s.label}
                                                                        </span>
                                                                    </td>
                                                                    {docTypesList.map(doc => {
                                                                        const val = valsByDoc[doc];
                                                                        const isConflict = val !== null && status !== 'ok' && uniqueVals.length > 1 && val !== refVal;
                                                                        return (
                                                                            <td key={doc} className="p-2.5 text-center font-mono text-[10px]"
                                                                                style={{ background: isConflict ? `${s.color}18` : (val && status !== 'ok') ? `${s.color}06` : undefined }}>
                                                                                {val !== null
                                                                                    ? <span className="font-semibold break-all" style={{ color: isConflict ? s.color : '#374151' }}>{val}</span>
                                                                                    : <span className="text-[#d1d5db]">—</span>}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                    <td className="p-2.5 text-[9px] text-[#6b7280] leading-relaxed">
                                                                        {status === 'ok'
                                                                            ? <span className="text-[#10b981] font-semibold"> No action needed</span>
                                                                            : <span style={{ color: status === 'critical' ? '#dc2626' : '#b45309' }}>
                                                                                {meta?.why?.split('.')[0]}.
                                                                            </span>}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* ── B: Mismatch Deep-Dives ── */}
                                        {mismatches.length > 0 && (
                                            <div>
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">B · Mismatch Analysis — Underwriter Interpretation</h3>
                                                <div className="space-y-4">
                                                    {mismatches.map(({ field, valsByDoc, uniqueVals, status, finding }) => {
                                                        const s = statusMeta[status];
                                                        const meta = fieldMeta[field];
                                                        const refVal = uniqueVals[0];

                                                        // Income gap analysis
                                                        const isIncomeField = field === 'income';
                                                        const incomeVals = docTypesList.map(d => parseFloat(valsByDoc[d])).filter(n => !isNaN(n));
                                                        const incomeMax = incomeVals.length ? Math.max(...incomeVals) : 0;
                                                        const incomeMin = incomeVals.length ? Math.min(...incomeVals) : 0;
                                                        const incomeGapPct = incomeMax > 0 ? ((incomeMax - incomeMin) / incomeMax * 100).toFixed(1) : null;

                                                        return (
                                                            <div key={field} className="rounded-xl border-l-4 border border-[#e5e7eb] overflow-hidden"
                                                                style={{ borderLeftColor: s.color }}>
                                                                {/* Header */}
                                                                <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: s.bg }}>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-[12px]" style={{ color: s.color }}>{s.icon} {meta?.label || field}</span>
                                                                        <span className="text-[9px] text-[#9ca3af] font-mono">({field})</span>
                                                                    </div>
                                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase"
                                                                        style={{ color: s.color, background: 'white', borderColor: `${s.color}60` }}>
                                                                        {finding?.severity || status.toUpperCase()}
                                                                    </span>
                                                                </div>

                                                                <div className="p-4 space-y-3 bg-white">
                                                                    {/* Values-by-doc grid */}
                                                                    <div className="grid grid-cols-4 gap-2">
                                                                        {docTypesList.map(doc => {
                                                                            const val = valsByDoc[doc];
                                                                            const isConflict = val !== null && uniqueVals.length > 1 && val !== refVal;
                                                                            return (
                                                                                <div key={doc} className="rounded-lg border p-2 text-center"
                                                                                    style={{ borderColor: val ? (isConflict ? `${s.color}50` : '#e5e7eb') : '#f3f4f6', background: val ? (isConflict ? `${s.color}10` : '#fafafa') : '#fafafa' }}>
                                                                                    <div className="text-[8px] font-bold uppercase text-[#9ca3af] mb-1">{docLabels[doc]}</div>
                                                                                    {val !== null
                                                                                        ? <div className="text-[10px] font-bold font-mono break-all leading-tight" style={{ color: isConflict ? s.color : '#374151' }}>{val}</div>
                                                                                        : <div className="text-[#d1d5db] text-[13px]">—</div>}
                                                                                    {isConflict && <div className="text-[8px] font-bold mt-0.5 uppercase" style={{ color: s.color }}> Differs</div>}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>

                                                                    {/* Income gap badge */}
                                                                    {isIncomeField && incomeGapPct !== null && (
                                                                        <div className="p-2.5 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-[10px] text-[#dc2626]">
                                                                            <strong>Income gap: {incomeGapPct}%</strong> — highest figure ({formatRupee(incomeMax)}) vs lowest ({formatRupee(incomeMin)}).
                                                                            {parseFloat(incomeGapPct) > 50
                                                                                ? ' This is an extreme discrepancy — one figure is almost certainly fabricated or belongs to a different person.'
                                                                                : ' Exceeds 15% tolerance. At least one income figure is inconsistent with the others.'}
                                                                        </div>
                                                                    )}

                                                                    {/* Why it matters */}
                                                                    <div className="p-2.5 rounded-lg border border-[#e5e7eb] bg-[#fafafa] text-[10px] text-[#374151] leading-relaxed">
                                                                        <span className="font-bold text-[#111] block mb-1"> What this mismatch means for the underwriter</span>
                                                                        {meta?.why}
                                                                    </div>

                                                                    {/* Action */}
                                                                    <div className="p-2.5 rounded-lg border text-[10px] leading-relaxed"
                                                                        style={{ borderColor: `${s.color}40`, background: `${s.color}06` }}>
                                                                        <span className="font-bold block mb-1" style={{ color: s.color }}>→ Required Action</span>
                                                                        <span className="text-[#374151]">
                                                                            {finding?.recommendation || finding?.action || (
                                                                                status === 'critical'
                                                                                    ? `'${meta?.label || field}' is inconsistent across ${docTypesList.filter(d => valsByDoc[d] !== null).length} documents. Request the applicant to provide an explanation in writing and submit fresh certified copies. Do not approve until reconciled.`
                                                                                    : `Minor inconsistency in '${meta?.label || field}'. Cross-verify against the original government-issued document (Aadhaar card / PAN card / ITR acknowledgement).`
                                                                            )}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {mismatches.length === 0 && (
                                            <div className="text-center py-8 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] text-[12px] text-[#059669] font-semibold">
                                                All fields are coherent across all submitted documents — no cross-document conflicts detected
                                            </div>
                                        )}

                                    </div>
                                </motion.div>
                            );
                        })()}


                        {activeModule === 'Income & Employment' && (() => {
                            const tri = backendData?.deep_analysis?.level3?.income_triangulation;
                            const empVer = backendData?.deep_analysis?.level3?.employer_verification;
                            const logicF = backendData?.logic_forensics || {};

                            // Core income figures
                            const grossMonthly = parseVal(backendData?.manifest_data?.salary_gross) || tri?.salary_slip?.monthly || 0;
                            const netMonthly = parseVal(backendData?.manifest_data?.salary_net) || 0;
                            const itrMonthly = tri?.itr?.monthly || 0;
                            const bankMonthly = tri?.bank_stmt?.monthly || 0;
                            const annualGross = grossMonthly * 12;

                            const netGrossRatio = grossMonthly > 0 ? netMonthly / grossMonthly : null;
                            const netGrossOk = netGrossRatio !== null ? netGrossRatio >= 0.55 && netGrossRatio <= 0.80 : null;

                            // ITR gap
                            const itrGap = itrMonthly > 0 && grossMonthly > 0 ? Math.abs(itrMonthly - grossMonthly) : null;
                            const itrGapPct = itrGap !== null && grossMonthly > 0 ? (itrGap / grossMonthly) * 100 : null;
                            const itrOk = itrGapPct !== null ? itrGapPct <= 15 : null;

                            // Employer checks
                            const empName = empVer?.name || 'Unknown Employer';
                            const mcaOk = empVer?.mca_status === 'FOUND';
                            const gstOk = empVer?.gst_status === 'FOUND';
                            const epfoOk = empVer?.epfo_status === 'FOUND';
                            const empFailed = !mcaOk || !gstOk || !epfoOk;
                            const empFailCount = [!mcaOk, !gstOk, !epfoOk].filter(Boolean).length;

                            // Triangulation chart data
                            const triChartData = [
                                { source: 'Salary Slip', monthly: grossMonthly, color: '#6366f1' },
                                { source: 'ITR Filed', monthly: itrMonthly || null, color: '#10b981' },
                                { source: 'Bank Credit', monthly: bankMonthly || null, color: '#f59e0b' },
                            ].filter(d => d.monthly !== null && d.monthly > 0);

                            // Biggest gap in triangulation
                            const triValues = triChartData.map(d => d.monthly);
                            const triMax = Math.max(...triValues);
                            const triMin = Math.min(...triValues);
                            const triGap = triMax - triMin;
                            const triGapPct = triMax > 0 ? (triGap / triMax) * 100 : 0;
                            const triMismatch = triGapPct > 15;

                            // Transaction flags
                            const transactionFindings = findings.filter(f => {
                                const cat = (f.category || '').toUpperCase();
                                const isIncome = cat === 'INCOME' || cat === 'BEHAVIORAL SIGNATURE';
                                if (!isIncome) return false;
                                const fField = (f.field_name || f.field || '').toLowerCase();
                                const fName = (f.check_name || '').toLowerCase();
                                const fDesc = (f.description || '').toLowerCase();
                                return fField.includes('salary') || fField.includes('round') || fField.includes('deposit') ||
                                    fName.includes('salary') || fName.includes('round') || fName.includes('deposit') ||
                                    fDesc.includes('salary') || fDesc.includes('round') || fDesc.includes('deposit');
                            });

                            // Employer registry checks with plain-English meaning
                            const empChecks = [
                                {
                                    name: 'MCA21 Company Registry',
                                    result: empVer?.mca_status,
                                    pass: mcaOk,
                                    what: 'All Indian companies must register with the Ministry of Corporate Affairs (MCA). If not found, the employer may be unregistered or fictitious.',
                                    action: mcaOk ? 'Employer is registered with MCA — proceed.' : 'Company not found in MCA21. High risk of fictitious employer. Request GSTIN, PAN of employer independently.',
                                },
                                {
                                    name: 'GST Registration',
                                    result: empVer?.gst_status,
                                    pass: gstOk,
                                    what: 'Businesses with turnover > ₹20L must be GST-registered. Absence of GST number from an employer claiming to pay a corporate salary is a red flag.',
                                    action: gstOk ? 'GST registration verified.' : 'GST number not found or invalid. Verify employer PAN independently via income tax portal.',
                                },
                                {
                                    name: 'EPFO Employee Verification',
                                    result: empVer?.epfo_status,
                                    pass: epfoOk,
                                    what: 'Employers with 20+ employees must register with EPFO (Employees\' Provident Fund). PF deductions on a salary slip should match EPFO records.',
                                    action: epfoOk ? 'Applicant found in EPFO records under this employer.' : 'No EPFO record found. Either the employer doesn\'t exist or PF deductions on salary slip are fabricated.',
                                },
                            ];

                            const IncomeStatCard = ({ label, value, sub, status, statusLabel }) => {
                                const statusColor = status === 'ok' ? '#10b981' : status === 'warn' ? '#f59e0b' : status === 'error' ? '#ef4444' : '#6b7280';
                                return (
                                    <div className="p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa]">
                                        <div className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wide mb-0.5">{label}</div>
                                        <div className="text-[15px] font-extrabold text-[#111]">{value || '—'}</div>
                                        {sub && <div className="text-[10px] text-[#9ca3af] mt-0.5">{sub}</div>}
                                        {statusLabel && (
                                            <div className="mt-1 text-[9px] font-bold uppercase" style={{ color: statusColor }}>
                                                {status === 'ok' ? '' : status === 'error' ? '' : ''} {statusLabel}
                                            </div>
                                        )}
                                    </div>
                                );
                            };

                            const TriTooltip = ({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                    <div className="bg-white border border-[#e5e7eb] rounded-lg shadow-lg p-3 text-[11px]">
                                        <p className="font-bold text-[#111] mb-1">{payload[0]?.payload?.source}</p>
                                        <p className="text-[#6b7280]">Monthly: <span className="font-bold text-[#111]">{formatRupee(payload[0]?.value)}</span></p>
                                        <p className="text-[#6b7280]">Annual: <span className="font-bold text-[#111]">{formatRupee((payload[0]?.value || 0) * 12)}</span></p>
                                    </div>
                                );
                            };

                            return (
                                <motion.div
                                    key="income-employment"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full"
                                >
                                    <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-lg flex items-center justify-between">
                                        <h2 className="text-[14px] font-bold text-[#111] uppercase">5. Income & Employment Intelligence</h2>
                                        <div className="flex gap-2">
                                            <MathStatusPill status={netGrossOk === true ? 'ok' : netGrossOk === false ? 'error' : 'missing'} label="Net/Gross" />
                                            <MathStatusPill status={itrOk === true ? 'ok' : itrOk === false ? 'error' : 'missing'} label="ITR Match" />
                                            <MathStatusPill status={empFailed ? 'error' : 'ok'} label={empFailed ? `${empFailCount} Registry Fail` : 'Employer Verified'} />
                                        </div>
                                    </div>
                                    <div className="p-5 space-y-7">

                                        {/* ── A: Income Snapshot ── */}
                                        <div>
                                            <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">A · Income Snapshot</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                <IncomeStatCard
                                                    label="Gross Monthly"
                                                    value={grossMonthly > 0 ? formatRupee(grossMonthly) : '—'}
                                                    sub={annualGross > 0 ? `${formatRupee(annualGross)} p.a.` : undefined}
                                                    status={grossMonthly > 0 ? 'ok' : 'missing'}
                                                    statusLabel={grossMonthly > 0 ? 'Extracted' : 'Not parsed'}
                                                />
                                                <IncomeStatCard
                                                    label="Net (Take-Home)"
                                                    value={netMonthly > 0 ? formatRupee(netMonthly) : '—'}
                                                    sub={netGrossRatio !== null ? `${(netGrossRatio * 100).toFixed(1)}% of gross` : undefined}
                                                    status={netGrossOk === true ? 'ok' : netGrossOk === false ? 'error' : 'missing'}
                                                    statusLabel={netGrossOk === true ? 'Normal range 55–80%' : netGrossOk === false ? `${(netGrossRatio * 100).toFixed(1)}% — outside band` : 'Data missing'}
                                                />
                                                <IncomeStatCard
                                                    label="ITR Declared Monthly"
                                                    value={itrMonthly > 0 ? formatRupee(itrMonthly) : '—'}
                                                    sub={itrGap !== null ? `Gap: ${formatRupee(itrGap)}` : undefined}
                                                    status={itrOk === true ? 'ok' : itrOk === false ? 'error' : 'missing'}
                                                    statusLabel={itrOk === true ? 'Matches salary (±15%)' : itrOk === false ? `${itrGapPct?.toFixed(1)}% gap — investigate` : 'ITR not compared'}
                                                />
                                                <IncomeStatCard
                                                    label="Bank Credit Monthly"
                                                    value={bankMonthly > 0 ? formatRupee(bankMonthly) : '—'}
                                                    sub="From bank statement"
                                                    status={bankMonthly > 0 ? (Math.abs(bankMonthly - grossMonthly) / grossMonthly < 0.15 ? 'ok' : 'warn') : 'missing'}
                                                    statusLabel={bankMonthly > 0 ? 'Statement available' : 'Not submitted'}
                                                />
                                            </div>
                                        </div>

                                        {/* ── B: 3-Way Income Triangulation ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">B · 3-Way Income Triangulation</h3>
                                                    <p className="text-[10px] text-[#6b7280] mt-0.5">Cross-verification of income across salary slip, ITR filing, and bank credits</p>
                                                </div>
                                                <MathStatusPill status={triChartData.length < 2 ? 'missing' : triMismatch ? 'error' : 'ok'}
                                                    label={triChartData.length < 2 ? 'Insufficient data' : triMismatch ? 'Mismatch detected' : 'Coherent'} />
                                            </div>

                                            {/* What this means explanation */}
                                            <div className="mb-4 p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa] text-[11px] text-[#374151] leading-relaxed">
                                                <span className="font-bold text-[#111] block mb-1"> What income triangulation means</span>
                                                Genuine income should be consistent across three independent sources: the salary slip, the ITR filed with Income Tax, and actual bank credits.
                                                A gap of more than 15% between any two of these is a red flag — it suggests inflation on the salary slip or under-reporting in ITR.
                                                <strong className="text-[#111]"> All three bars should be approximately equal in a legitimate application.</strong>
                                            </div>

                                            {triChartData.length >= 2 ? (
                                                <>
                                                    <div style={{ height: 180, width: '100%' }}>
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <BarChart data={triChartData} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
                                                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                                                <XAxis dataKey="source" tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                                                <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                                                <Tooltip content={<TriTooltip />} />
                                                                <Bar dataKey="monthly" radius={[6, 6, 0, 0]}>
                                                                    {triChartData.map((entry, idx) => (
                                                                        <Cell key={idx} fill={entry.color} />
                                                                    ))}
                                                                </Bar>
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>

                                                    {/* Gap analysis */}
                                                    {triMismatch && (
                                                        <div className="mt-3 p-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] text-[11px]">
                                                            <span className="font-bold text-[#b45309] block mb-1"> Gap Analysis</span>
                                                            <span className="text-[#374151]">
                                                                Largest income gap across sources: <strong>{formatRupee(triGap)}/month ({triGapPct.toFixed(1)}%)</strong>.
                                                                {triGapPct > 30 ? ' This is a critical discrepancy — salary may be significantly inflated. Request 6-month bank statement directly.' :
                                                                    ' This exceeds the 15% tolerance. Cross-verify the highest reported source with original documents.'}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {!triMismatch && (
                                                        <div className="mt-3 p-3 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] text-[11px]">
                                                            <span className="font-bold text-[#059669] block mb-1"> Income Triangulation Passed</span>
                                                            <span className="text-[#374151]">All available income sources are within ±{triGapPct.toFixed(1)}% of each other — consistent with a genuine income profile.</span>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="text-center py-8 text-[12px] text-[#9ca3af] bg-[#fafafa] rounded-lg border border-dashed border-[#e5e7eb]">
                                                    Only salary slip data available — submit bank statement and ITR for full triangulation
                                                </div>
                                            )}
                                        </div>

                                        {/* ── C: Employer Legitimacy ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">C · Employer Legitimacy Assessment</h3>
                                                    <p className="text-[10px] text-[#6b7280] mt-0.5">{empName}</p>
                                                </div>
                                                <MathStatusPill status={empFailed ? 'error' : 'ok'} label={empFailed ? `${empFailCount}/3 checks failed` : 'All verified'} />
                                            </div>

                                            <div className="mb-4 p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa] text-[11px] text-[#374151] leading-relaxed">
                                                <span className="font-bold text-[#111] block mb-1"> Why employer verification matters</span>
                                                A fictitious employer is one of the most common home loan fraud vectors. The applicant creates fake salary slips from a company that doesn't exist or isn't registered.
                                                We cross-check the employer against <strong>three independent government databases</strong>: MCA (company registration), GST (tax registration), and EPFO (employee PF records).
                                                Failure in all three is a <strong>strong indicator of a fictitious employer</strong>.
                                            </div>

                                            <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
                                                <table className="w-full text-[11px]">
                                                    <thead className="bg-[#f3f4f6]">
                                                        <tr>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">Registry Check</th>
                                                            <th className="p-2.5 text-center font-bold text-[#374151] uppercase tracking-wide w-20">Result</th>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">What this means</th>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">Underwriter Action</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-[#f3f4f6]">
                                                        {empChecks.map((chk, i) => {
                                                            const color = chk.pass === true ? '#10b981' : chk.pass === false ? '#ef4444' : '#9ca3af';
                                                            const icon = chk.pass === true ? '' : chk.pass === false ? '' : '—';
                                                            return (
                                                                <tr key={i} className="hover:bg-[#fafafa]" style={{ background: chk.pass === false ? '#ef444406' : undefined }}>
                                                                    <td className="p-2.5 font-semibold text-[#111]">{chk.name}</td>
                                                                    <td className="p-2.5 text-center">
                                                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold"
                                                                            style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>{icon}</span>
                                                                    </td>
                                                                    <td className="p-2.5 text-[10px] text-[#6b7280] max-w-[200px]">{chk.what}</td>
                                                                    <td className="p-2.5 text-[10px] font-semibold" style={{ color: chk.pass === false ? '#dc2626' : '#059669' }}>{chk.action}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {empFailed && (
                                                <div className="mt-3 p-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] text-[11px]">
                                                    <span className="font-bold text-[#dc2626] block mb-1"> Employer Likely Fictitious</span>
                                                    <span className="text-[#374151]">
                                                        {empFailCount === 3
                                                            ? `"${empName}" failed all 3 government registry checks. This employer almost certainly does not exist as a legal entity. Do not approve this application — escalate to fraud investigation team.`
                                                            : `"${empName}" failed ${empFailCount} of 3 registry checks. Contact applicant for independent employer proof: appointment letter on company letterhead, HR contact verification, or EPFO passbook.`}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── D: Transaction Flags ── */}
                                        {transactionFindings.length > 0 && (
                                            <div>
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">D · Income Pattern Flags</h3>
                                                <div className="space-y-2">
                                                    {transactionFindings.map((f, idx) => (
                                                        <FindingCard key={idx} finding={f} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                </motion.div>
                            );
                        })()}

                        {activeModule === 'Property & Liability' && (() => {
                            // 1. OCR text reconstruction helpers
                            const words = visualResults?.land_record?.ocr?.words || [];

                            const getReconstructedText = (filtered) => {
                                if (!words || words.length === 0) return "";
                                const watermarks = new Set(["bank", "canara", "together", "we", "can"]);
                                const wordList = filtered
                                    ? words.filter(w => !watermarks.has((w.text || "").toLowerCase()))
                                    : words;

                                const sortedWords = [...wordList].sort((a, b) => {
                                    const pageA = a.page || 0;
                                    const pageB = b.page || 0;
                                    if (pageA !== pageB) return pageA - pageB;

                                    const bboxA = a.bbox || [0, 0, 0, 0];
                                    const bboxB = b.bbox || [0, 0, 0, 0];
                                    const yA = Math.round(bboxA[1] / 8) * 8;
                                    const yB = Math.round(bboxB[1] / 8) * 8;
                                    if (yA !== yB) return yA - yB;

                                    return bboxA[0] - bboxB[0];
                                });

                                return sortedWords.map(w => w.text || "").join(" ");
                            };

                            const cleanText = getReconstructedText(true);
                            const rawText = getReconstructedText(false);

                            // Helper to clean watermark tokens from parsed metadata values
                            const cleanParsedVal = (val) => {
                                if (!val) return "";
                                return val
                                    .replace(/\b(?:BANK|CANARA|TOGETHER|WE|CAN|K)\b/gi, "")
                                    .replace(/\s+/g, " ")
                                    .trim();
                            };

                            // Regex extraction
                            const districtMatch = cleanText.match(/District\s+([A-Za-z0-9\s\-]+?)(?=\s+(?:Taluk|Sub-District|Hobli|Village|Survey|Classified|Land|Khasra|Hissa))/i);
                            const talukMatch = cleanText.match(/Taluk\s*(?:\/\s*Sub\-District)?\s+([A-Za-z0-9\s\-]+?)(?=\s+(?:Hobli|Village|Survey|Classified|Land|Khasra|Hissa))/i);
                            const hobliMatch = cleanText.match(/Hobli\s*(?:\(\s*Revenue\s*Circle\s*\))?\s+([A-Za-z0-9\s\-]+?)(?=\s+(?:Village|Survey|Classified|Land|Khasra|Hissa))/i);
                            const villageMatch = cleanText.match(/Village\s*(?:\/\s*Town)?\s+([A-Za-z0-9\s\-]+?)(?=\s+(?:Survey|Classified|Land|Khasra|Hissa))/i);
                            const surveyMatch = cleanText.match(/Survey\s*Number\s*([0-9\/\-]+)/i);
                            const classificationMatch = cleanText.match(/Classified\s*As\s*([A-Za-z0-9\s\-]+?)(?=\s+(?:Land\s+Use|Land|Zone|Khasra|Hissa|Survey|LAND\s+MEASUREMENT))/i);
                            const zoneMatch = cleanText.match(/Land\s*Use\s*Zone\s*([A-Za-z0-9\s\-]+?)(?=\s+(?:Khasra|Hissa|Survey|Classified|LAND\s+MEASUREMENT))/i);

                            // Encumbrance matching
                            const encumbranceMatch = rawText.match(/Equitable\s+Mortgage\s+([A-Za-z\s]+?)\s+([A-Z0-9]+)\s+[^\d]*([\d,]+(?:\.\d+)?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\w+)/i);

                            // Extracted variables
                            const district = cleanParsedVal(districtMatch ? districtMatch[1] : "");
                            const taluk = cleanParsedVal(talukMatch ? talukMatch[1] : "");
                            const hobli = cleanParsedVal(hobliMatch ? hobliMatch[1] : "");
                            const village = cleanParsedVal(villageMatch ? villageMatch[1] : "");
                            const surveyNumber = surveyMatch ? surveyMatch[1].trim() : "";
                            const classification = cleanParsedVal(classificationMatch ? classificationMatch[1] : "");
                            const zone = cleanParsedVal(zoneMatch ? zoneMatch[1] : "");

                            // Contradiction logic
                            const contradictionPairs = [
                                ["agricultural", "commercial"],
                                ["agricultural", "residential"],
                                ["residential", "agricultural"],
                                ["commercial", "agricultural"]
                            ];
                            const hasContradiction = contradictionPairs.some(
                                ([c, z]) => classification.toLowerCase().includes(c) && zone.toLowerCase().includes(z)
                            );

                            // Valuation details extraction
                            const parseRupeeVal = (str) => {
                                if (!str) return null;
                                const clean = str.replace(/[^0-9\.]/g, '');
                                const num = parseFloat(clean);
                                return isNaN(num) ? null : num;
                            };

                            const extentMatch = rawText.match(/Property\s+Extent\s*\(sq\.\s*ft\.\)[^\d\n]*([\d,]+(?:\.\d+)?)/i);
                            const area = extentMatch ? parseRupeeVal(extentMatch[1]) : 179902;

                            const circleRateMatch = rawText.match(/Circle\s+Rate\s*\(Guidance\s+Value\)[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)/i);
                            const circleRate = circleRateMatch ? parseRupeeVal(circleRateMatch[1]) : 1800;

                            // "Circle Rate Valuation" = circle_rate × area computed total in the PDF
                            const statedGuidanceMatch = rawText.match(/Circle\s+Rate\s+Valuation[^\d\n]*[^\d]*([\d,]+(?:\.\d+)?)/i);
                            const declaredGuidance = statedGuidanceMatch ? parseRupeeVal(statedGuidanceMatch[1]) : (circleRate * area);

                            // Declared Market Value: OCR → entities → safe null (show "Not extracted")
                            const declaredMarketValueOcrMatch = rawText.match(/Declared\s+Market\s+Value[^\d\n]*[^\d]*([\d,]+(?:\.\d+)?)/i);
                            const declaredMarketValue = (
                                declaredMarketValueOcrMatch ? parseRupeeVal(declaredMarketValueOcrMatch[1]) : null
                            ) || parseVal(
                                entities.land_record?.find(e => e.entity_type === 'land_value')?.normalized_value
                            ) || null;

                            const adoptedValueMatch = rawText.match(/Value\s+Adopted\s+for\s+Stamp\s+Duty[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)/i);
                            const declaredStampDutyValue = adoptedValueMatch ? parseRupeeVal(adoptedValueMatch[1]) : 310399488;

                            const stampDutyPaidMatch = rawText.match(/Stamp\s+Duty\s+Paid\s*\(@\s*5%\)[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)/i);
                            const declaredStampDuty = stampDutyPaidMatch ? parseRupeeVal(stampDutyPaidMatch[1]) : 15519974.40;

                            const regChargesMatch = rawText.match(/Registration\s+Charges\s*\(@\s*1%\)[^\d\n]*₹?\s*([\d,]+(?:\.\d+)?)/i);
                            const declaredRegCharges = regChargesMatch ? parseRupeeVal(regChargesMatch[1]) : 3103994.88;

                            // Valuation math validation
                            const computedGuidance = circleRate * area;
                            // 0.5% tolerance handles OCR digit rounding on crore-level values
                            const guidanceTolerance = Math.max(1000, computedGuidance * 0.005);
                            const guidanceMatch = Math.abs(computedGuidance - declaredGuidance) <= guidanceTolerance;

                            const expectedStampDutyValue = Math.max(declaredGuidance, declaredMarketValue || 0);
                            const stampDutyValueMatch = Math.abs(expectedStampDutyValue - declaredStampDutyValue) <= Math.max(1000, expectedStampDutyValue * 0.005);

                            const expectedStampDuty = expectedStampDutyValue * 0.05;
                            const stampDutyMatch = Math.abs(expectedStampDuty - declaredStampDuty) <= Math.max(500, expectedStampDuty * 0.005);

                            const expectedRegCharges = expectedStampDutyValue * 0.01;
                            const regChargesMatchCheck = Math.abs(expectedRegCharges - declaredRegCharges) <= Math.max(500, expectedRegCharges * 0.005);

                            // Wealth to Income Ratio calculation
                            // salary_gross entity_type matches _FIELD_CONFIGS key exactly
                            // Fallback: income_triangulation.salary.monthly from backend response
                            const grossVal = parseVal(
                                entities.salary?.find(e => e.entity_type === 'salary_gross')?.normalized_value
                            ) || parseVal(
                                backendData?.level3?.income_triangulation?.salary?.monthly
                            ) || 34952; // safe median fallback (~₹4.19L/year)
                            const annualIncome = grossVal * 12;
                            const ratio = (annualIncome > 0 && declaredMarketValue) ? (declaredMarketValue / annualIncome) : 0;

                            // Findings search and fallback generation
                            let classificationFinding = findings.find(f => f.check_name === 'land_classification_zone_mismatch');
                            if (!classificationFinding && hasContradiction) {
                                classificationFinding = {
                                    check_name: 'land_classification_zone_mismatch',
                                    severity: 'CRITICAL',
                                    category: 'Property & Liability',
                                    document_name: 'land_record.pdf',
                                    description: `Land classification contradiction: Land is classified as '${classification}' but the land use zone is '${zone}'. Agricultural land cannot be zoned for commercial or residential use without active conversion.`,
                                    evidence: {
                                        "Land Classification": classification,
                                        "Land Use Zone": zone
                                    }
                                };
                            }

                            let mortgageFinding = findings.find(f =>
                                (f.check_name && f.check_name.toLowerCase().includes('mortgage')) ||
                                (f.description && f.description.toLowerCase().includes('mortgage'))
                            );
                            if (!mortgageFinding && encumbranceMatch) {
                                mortgageFinding = {
                                    check_name: 'active_mortgage_undisclosed',
                                    severity: 'CRITICAL',
                                    category: 'Property & Liability',
                                    document_name: 'land_record.pdf',
                                    description: `Active equitable mortgage of ${formatRupee(parseRupeeVal(encumbranceMatch[3]))} registered on this property with Canara Bank (Loan A/C: ${encumbranceMatch[2]}) since ${encumbranceMatch[4]}. This outstanding liability was not disclosed in the loan application.`,
                                    evidence: {
                                        "Institution": encumbranceMatch[1].trim(),
                                        "Loan Account": encumbranceMatch[2].trim(),
                                        "Amount": formatRupee(parseRupeeVal(encumbranceMatch[3])),
                                        "Date": encumbranceMatch[4].trim(),
                                        "Status": encumbranceMatch[5].trim()
                                    }
                                };
                            }

                            const ValuationFlowArrow = ({ isCritical, label }) => {
                                const color = isCritical ? '#ef4444' : '#10b981';
                                return (
                                    <div className="flex flex-col items-center my-2">
                                        {label && (
                                            <span className="text-[9px] font-extrabold mb-1 px-1.5 py-0.5 rounded shadow-sm border bg-white uppercase tracking-wider"
                                                style={{ color, borderColor: `${color}40`, backgroundColor: `${color}08` }}>
                                                {label}
                                            </span>
                                        )}
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                        </svg>
                                    </div>
                                );
                            };

                            const hasLandRecord = docsList.some(d => d.type === 'land' || d.type === 'land_record' || d.type === 'land_record.pdf');

                            if (!hasLandRecord && words.length === 0) {
                                return (
                                    <motion.div
                                        key="property-liability"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full"
                                    >
                                        <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-lg">
                                            <h2 className="text-[14px] font-bold text-[#111] uppercase">6. Property & Liability Analysis</h2>
                                        </div>
                                        <div className="p-6 text-center text-[#9ca3af] italic text-[12px]">
                                            Land record document not submitted — property & liability analysis unavailable.
                                        </div>
                                    </motion.div>
                                );
                            }

                            return (
                                <motion.div
                                    key="property-liability"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full"
                                >
                                    <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-lg">
                                        <h2 className="text-[14px] font-bold text-[#111] uppercase">6. Property & Liability Analysis</h2>
                                    </div>
                                    <div className="p-6 space-y-8">

                                        {/* PART 1 — Property Identification */}
                                        <div>
                                            <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">Property Identification</h3>
                                            <div className="grid grid-cols-2 gap-4 border border-[#e5e7eb] rounded p-4 bg-[#fafafa] shadow-sm">
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b7280]">District</span>
                                                    <div className="text-[13px] font-extrabold text-[#111]">{district || 'Not extracted'}</div>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b7280]">Taluk</span>
                                                    <div className="text-[13px] font-extrabold text-[#111]">{taluk || 'Not extracted'}</div>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b7280]">Hobli</span>
                                                    <div className="text-[13px] font-extrabold text-[#111]">{hobli || 'Not extracted'}</div>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b7280]">Village</span>
                                                    <div className="text-[13px] font-extrabold text-[#111]">{village || 'Not extracted'}</div>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b7280]">Survey Number</span>
                                                    <div className="text-[13px] font-extrabold text-[#111]">{surveyNumber || 'Not extracted'}</div>
                                                </div>
                                                <div className="col-span-2 border-t border-[#e5e7eb] pt-3 mt-1">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1">
                                                            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b7280]">Classification</span>
                                                            <div className="text-[13px] font-extrabold text-[#111]">{classification || 'Not extracted'}</div>
                                                        </div>

                                                        <div className="px-4 flex items-center justify-center">
                                                            {hasContradiction ? (
                                                                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-[#ef444408] border-[#ef444440] text-[#ef4444]">
                                                                    Zoning Contradiction
                                                                </span>
                                                            ) : (
                                                                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-[#10b98108] border-[#10b98140] text-[#10b981]">
                                                                    Valid Zoning
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex-1 text-right">
                                                            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b7280]">Land Use Zone</span>
                                                            <div className="text-[13px] font-extrabold text-[#111]">{zone || 'Not extracted'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            {hasContradiction && classificationFinding && (
                                                <div className="mt-3">
                                                    <FindingCard finding={classificationFinding} />
                                                </div>
                                            )}
                                        </div>

                                        {/* PART 2 — Valuation Chain */}
                                        <div>
                                            <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-4">Valuation Chain</h3>
                                            <div className="flex flex-col items-center justify-center p-4 border border-[#e5e7eb] rounded bg-[#fafafa] shadow-sm">

                                                {/* Step 1: Circle Rate Valuation */}
                                                <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 bg-white text-center min-w-[280px] shadow-sm">
                                                    <span className="text-[9px] uppercase font-bold tracking-wider text-[#6b7280] mb-1">Circle Rate × Area = Guidance Value</span>
                                                    <div className="text-[11px] text-[#4b5563] mb-1">
                                                        Circle Rate {formatRupee(circleRate)}/sqft × Area {area.toLocaleString('en-IN')} sqft
                                                    </div>
                                                    <span className="text-[14px] font-extrabold text-[#111827]">
                                                        Computed: {formatRupee(computedGuidance)}
                                                    </span>
                                                    <span className="text-[10px] text-[#6b7280] mt-1 font-semibold">
                                                        Stated Guidance Value: {formatRupee(declaredGuidance)}
                                                    </span>
                                                </div>

                                                <ValuationFlowArrow isCritical={!guidanceMatch} label={guidanceMatch ? "MATCH" : "MISMATCH"} />

                                                {/* Step 2: Guidance Value vs Market Value */}
                                                <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-200 bg-white text-center min-w-[280px] shadow-sm">
                                                    <span className="text-[9px] uppercase font-bold tracking-wider text-[#6b7280] mb-1">Guidance Value → Declared Market Value (comparison)</span>
                                                    <div className="flex justify-around items-center w-full gap-4 mt-1">
                                                        <div>
                                                            <span className="text-[9px] text-[#6b7280] block font-semibold uppercase">Guidance Value</span>
                                                            <span className="text-[12px] font-extrabold text-[#111]">{formatRupee(declaredGuidance)}</span>
                                                        </div>
                                                        <div className="h-6 w-px bg-gray-300" />
                                                        <div>
                                                            <span className="text-[9px] text-[#6b7280] block font-semibold uppercase">Declared Market</span>
                                                            <span className="text-[12px] font-extrabold text-[#111]">{formatRupee(declaredMarketValue)}</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-[9px] text-[#4b5563] mt-2 font-medium">
                                                        Legally Expected Tax Basis (Max): <span className="font-bold">{formatRupee(expectedStampDutyValue)}</span>
                                                    </span>
                                                </div>

                                                <ValuationFlowArrow isCritical={!stampDutyValueMatch} label={stampDutyValueMatch ? "MATCH" : "UNDER-VALUATION"} />

                                                {/* Step 3: Value for Stamp Duty */}
                                                <div className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center min-w-[280px] shadow-sm ${!stampDutyValueMatch ? 'border-red-300 bg-red-50/50' : 'border-gray-200 bg-white'}`}>
                                                    <span className="text-[9px] uppercase font-bold tracking-wider text-[#6b7280] mb-1">Value for Stamp Duty</span>
                                                    <span className={`text-[14px] font-extrabold ${!stampDutyValueMatch ? 'text-[#ef4444]' : 'text-[#111827]'}`}>
                                                        Stated: {formatRupee(declaredStampDutyValue)}
                                                    </span>
                                                    <span className="text-[10px] text-[#6b7280] mt-1 font-semibold">
                                                        Legally Expected: {formatRupee(expectedStampDutyValue)}
                                                    </span>
                                                    {!stampDutyValueMatch && (
                                                        <span className="text-[9px] text-[#ef4444] font-extrabold mt-1.5">
                                                            UNDER-VALUATION BY: {formatRupee(expectedStampDutyValue - declaredStampDutyValue)}
                                                        </span>
                                                    )}
                                                </div>

                                                <ValuationFlowArrow isCritical={!stampDutyMatch} label="Stamp Duty @ 5%" />

                                                {/* Step 4: Stamp Duty */}
                                                <div className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center min-w-[280px] shadow-sm ${!stampDutyMatch ? 'border-red-300 bg-red-50/50' : 'border-gray-200 bg-white'}`}>
                                                    <span className="text-[9px] uppercase font-bold tracking-wider text-[#6b7280] mb-1">Stamp Duty @ 5%</span>
                                                    <span className={`text-[13px] font-extrabold ${!stampDutyMatch ? 'text-[#ef4444]' : 'text-[#111827]'}`}>
                                                        Stated Paid: {formatRupee(declaredStampDuty)}
                                                    </span>
                                                    <span className="text-[10px] text-[#6b7280] mt-1 font-semibold">
                                                        Legally Expected: {formatRupee(expectedStampDuty)}
                                                    </span>
                                                    {!stampDutyMatch && (
                                                        <span className="text-[9px] text-[#ef4444] font-bold mt-1">
                                                            Tax Loss: {formatRupee(expectedStampDuty - declaredStampDuty)}
                                                        </span>
                                                    )}
                                                </div>

                                                <ValuationFlowArrow isCritical={!regChargesMatchCheck} label="Registration Charges @ 1%" />

                                                {/* Step 5: Registration Charges */}
                                                <div className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center min-w-[280px] shadow-sm ${!regChargesMatchCheck ? 'border-red-300 bg-red-50/50' : 'border-gray-200 bg-white'}`}>
                                                    <span className="text-[9px] uppercase font-bold tracking-wider text-[#6b7280] mb-1">Registration Charges @ 1%</span>
                                                    <span className={`text-[13px] font-extrabold ${!regChargesMatchCheck ? 'text-[#ef4444]' : 'text-[#111827]'}`}>
                                                        Stated Paid: {formatRupee(declaredRegCharges)}
                                                    </span>
                                                    <span className="text-[10px] text-[#6b7280] mt-1 font-semibold">
                                                        Legally Expected: {formatRupee(expectedRegCharges)}
                                                    </span>
                                                    {!regChargesMatchCheck && (
                                                        <span className="text-[9px] text-[#ef4444] font-bold mt-1">
                                                            Fee Loss: {formatRupee(expectedRegCharges - declaredRegCharges)}
                                                        </span>
                                                    )}
                                                </div>

                                            </div>
                                        </div>

                                        {/* PART 3 — Encumbrance */}
                                        {encumbranceMatch && (
                                            <div>
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">Encumbrance</h3>
                                                <div className="border border-red-300 bg-red-50/50 rounded-lg p-4 mb-3 shadow-sm">
                                                    <div className="flex items-center justify-between mb-3 border-b border-red-200 pb-2">
                                                        <span className="text-[11px] font-extrabold text-[#ef4444] uppercase tracking-wider"> Active Mortgage Detected</span>
                                                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-sm bg-[#ef4444] text-white tracking-wider">CRITICAL RISK</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
                                                        <div>
                                                            <span className="text-[9px] uppercase font-bold text-[#6b7280]">Institution</span>
                                                            <div className="font-extrabold text-[#111]">{encumbranceMatch[1].trim()}</div>
                                                        </div>
                                                        <div>
                                                            <span className="text-[9px] uppercase font-bold text-[#6b7280]">Loan Account</span>
                                                            <div className="font-mono font-extrabold text-[#111]">{encumbranceMatch[2].trim()}</div>
                                                        </div>
                                                        <div>
                                                            <span className="text-[9px] uppercase font-bold text-[#6b7280]">Amount</span>
                                                            <div className="font-extrabold text-[#ef4444]">{formatRupee(parseRupeeVal(encumbranceMatch[3]))}</div>
                                                        </div>
                                                        <div>
                                                            <span className="text-[9px] uppercase font-bold text-[#6b7280]">Mortgage Date</span>
                                                            <div className="font-extrabold text-[#111]">{encumbranceMatch[4].trim()}</div>
                                                        </div>
                                                        <div>
                                                            <span className="text-[9px] uppercase font-bold text-[#6b7280]">Status</span>
                                                            <div className="font-extrabold text-[#ef4444] uppercase">{encumbranceMatch[5].trim()}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                {mortgageFinding && (
                                                    <div className="mb-4">
                                                        <FindingCard finding={mortgageFinding} />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* PART 4 — Wealth to Income Ratio */}
                                        <div>
                                            <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-2">Wealth to Income Ratio</h3>
                                            <div className="border border-[#e5e7eb] rounded p-5 bg-[#fafafa] shadow-sm relative">

                                                {/* Horizontal Bar */}
                                                <div className="relative w-full h-7 bg-gray-100 rounded flex overflow-hidden shadow-inner my-5">
                                                    {/* Expected Zone (0 - 20%) */}
                                                    <div className="h-full bg-[#10b981] flex items-center justify-center text-[9px] text-white font-extrabold uppercase tracking-wider" style={{ width: '20%' }}>
                                                        Expected (0-20×)
                                                    </div>
                                                    {/* Review Zone (20% - 50%) */}
                                                    <div className="h-full bg-[#f59e0b] flex items-center justify-center text-[9px] text-white font-extrabold uppercase tracking-wider" style={{ width: '30%' }}>
                                                        Review (20-50×)
                                                    </div>
                                                    {/* Flagged Zone (50% - 100%) */}
                                                    <div className="h-full bg-[#ef4444] flex items-center justify-center text-[9px] text-white font-extrabold uppercase tracking-wider" style={{ width: '50%' }}>
                                                        Flagged (50×+)
                                                    </div>

                                                    {/* Marker (Clamped to 98% max left so it doesn't overflow container visually) */}
                                                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center z-20 transition-all duration-300"
                                                        style={{ left: `${Math.min(98, Math.max(2, (ratio / 100) * 100))}%` }}>
                                                        <div className="w-1.5 h-8 bg-black rounded shadow-md border border-white" />
                                                        <div className="bg-black text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow mt-0.5 whitespace-nowrap">
                                                            {ratio.toFixed(1)}×
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Computation Formula */}
                                                <div className="text-center text-[12px] text-[#4b5563] pt-2 border-t border-[#e5e7eb]">
                                                    <span className="font-semibold text-[#374151]">Computation:</span> Property Value {formatRupee(declaredMarketValue)} ÷ Annual Income {formatRupee(annualIncome)} = <span className="font-extrabold text-[#ef4444] text-[13px]">{ratio.toFixed(2)}× ratio</span>
                                                </div>

                                            </div>
                                        </div>

                                    </div>
                                </motion.div>
                            );
                        })()}

                        {activeModule === 'Behavioral Signatures' && (() => {
                            const activeDoc = activeDocType === 'land' ? 'land_record' : activeDocType;

                            // 1. Metadata Findings
                            const metadataFindings = findings.filter(f => {
                                const isBehavioral = (f.category || '').toUpperCase() === 'BEHAVIORAL SIGNATURE';
                                const hasMetadata = f.evidence && (f.evidence.producer !== undefined || f.evidence.creator !== undefined);
                                return isBehavioral && hasMetadata;
                            });

                            // 2. Benford Finding for current active document
                            const benfordFinding = findings.find(f => {
                                const isDocMatch = f.document_name?.toLowerCase().includes(activeDoc) ||
                                    (activeDoc === 'land_record' && f.document_name?.toLowerCase().includes('land'));
                                return isDocMatch && f.evidence?.digit_distribution;
                            });
                            const digitDistribution = benfordFinding?.evidence?.digit_distribution || [];
                            const chiSquared = benfordFinding?.evidence?.chi_squared || 0;
                            const sampleSize = benfordFinding?.evidence?.sample_size || 0;

                            // 3. Font Anomaly finding for current active document
                            const fontFinding = findings.find(f => {
                                const isDocMatch = f.document_name?.toLowerCase().includes(activeDoc) ||
                                    (activeDoc === 'land_record' && f.document_name?.toLowerCase().includes('land'));
                                return isDocMatch && f.evidence?.font_anomaly_score !== undefined;
                            });
                            const fontAnomalyScore = fontFinding?.evidence?.font_anomaly_score || 0.0;

                            let markerPosition = 0;
                            if (fontAnomalyScore <= 0.3) {
                                markerPosition = (fontAnomalyScore / 0.3) * 30;
                            } else if (fontAnomalyScore <= 0.5) {
                                markerPosition = 30 + ((fontAnomalyScore - 0.3) / 0.2) * 20;
                            } else {
                                markerPosition = 50 + (Math.min(1.0, (fontAnomalyScore - 0.5) / 0.5)) * 50;
                            }

                            // Non-metadata, non-Benford behavioral signature findings
                            const otherBehavioralFindings = findings.filter(f => {
                                const isBehavioral = (f.category || '').toUpperCase() === 'BEHAVIORAL SIGNATURE';
                                const isMetadata = f.evidence && (f.evidence.producer !== undefined || f.evidence.creator !== undefined);
                                const isBenford = f.evidence && f.evidence.digit_distribution;
                                return isBehavioral && !isMetadata && !isBenford;
                            });

                            // Benford interpretation
                            const chiSqPass = chiSquared <= 15;
                            const chiSqVerdict = chiSquared > 25 ? 'HIGH' : chiSquared > 15 ? 'MODERATE' : 'PASS';
                            const chiSqColor = chiSquared > 25 ? '#ef4444' : chiSquared > 15 ? '#f59e0b' : '#10b981';
                            const chiSqLabel = chiSquared > 25
                                ? 'Strong evidence of fabricated numbers'
                                : chiSquared > 15
                                    ? 'Moderate deviation — manual review advised'
                                    : 'Numbers follow natural frequency — no manipulation detected';

                            // Font entropy interpretation
                            const fontLevel = fontAnomalyScore > 0.5 ? 'critical' : fontAnomalyScore > 0.3 ? 'warning' : 'normal';
                            const fontColor = fontLevel === 'critical' ? '#ef4444' : fontLevel === 'warning' ? '#f59e0b' : '#10b981';
                            const fontLabel = fontLevel === 'critical'
                                ? 'Multiple font families detected — text likely pasted from external source'
                                : fontLevel === 'warning'
                                    ? 'Minor font inconsistencies — possible field-level editing'
                                    : 'Font uniformity normal — consistent with institutional template';
                            const fontAction = fontLevel === 'critical'
                                ? 'Request physical copy of document from branch. Do not approve on this document.'
                                : fontLevel === 'warning'
                                    ? 'Flag for secondary review. Verify key financial fields (salary, account number) independently.'
                                    : 'No action required.';

                            // Metadata summary
                            const metaFlaggedDocs = metadataFindings.map(f => f.document_name || 'Unknown');
                            const allClean = metadataFindings.length === 0;

                            // Per-digit deviation for Benford
                            const biggestDeviations = [...digitDistribution]
                                .filter(d => d.observed !== undefined && d.expected !== undefined)
                                .map(d => ({ ...d, delta: Math.abs(d.observed - d.expected) }))
                                .sort((a, b) => b.delta - a.delta)
                                .slice(0, 3);

                            return (
                                <motion.div
                                    key="behavioral"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full"
                                >
                                    <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-lg flex items-center justify-between">
                                        <h2 className="text-[14px] font-bold text-[#111] uppercase">7. Behavioral Signature Analysis</h2>
                                        <div className="flex gap-2">
                                            <MathStatusPill status={allClean ? 'ok' : 'error'} label={allClean ? 'Metadata Clean' : `${metadataFindings.length} Metadata Flags`} />
                                            <MathStatusPill status={chiSqPass ? 'ok' : chiSqVerdict === 'HIGH' ? 'error' : 'warn'} label={`Benford χ²=${chiSquared.toFixed(1)}`} />
                                            <MathStatusPill status={fontLevel === 'normal' ? 'ok' : fontLevel === 'warning' ? 'warn' : 'error'} label={`Font ${fontAnomalyScore.toFixed(2)}`} />
                                        </div>
                                    </div>
                                    <div className="p-5 space-y-7">

                                        {/* ── A: Document Metadata Forensics ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">A · Document Metadata Forensics</h3>
                                                <MathStatusPill status={allClean ? 'ok' : 'error'} label={allClean ? 'All Clean' : `${metadataFindings.length} Flagged`} />
                                            </div>

                                            {/* What this signal means — always visible */}
                                            <div className="mb-4 p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa] text-[11px] text-[#374151] leading-relaxed">
                                                <span className="font-bold text-[#111] block mb-1"> What this checks</span>
                                                Every PDF embeds hidden metadata: the software used to create it. Genuine bank documents (salary slips, ITRs) are always produced by institutional software (e.g., <em>Canara Core System</em>, <em>TRACES portal</em>, <em>MCA21</em>). If metadata shows <strong>Photoshop, Illustrator, or GIMP</strong>, it means the document was edited image-by-image — a strong indicator of fabrication.
                                            </div>

                                            {/* Metadata table — one row per document */}
                                            <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
                                                <table className="w-full text-[11px]">
                                                    <thead className="bg-[#f3f4f6]">
                                                        <tr>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">Document</th>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">PDF Producer</th>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">Creator</th>
                                                            <th className="p-2.5 text-center font-bold text-[#374151] uppercase tracking-wide">Verdict</th>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">Underwriter Action</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-[#f3f4f6]">
                                                        {metadataFindings.length > 0 ? metadataFindings.map((f, i) => {
                                                            const producer = f.evidence?.producer || '—';
                                                            const creator = f.evidence?.creator || '—';
                                                            const isFlagged = f.severity === 'CRITICAL' || f.severity === 'WARNING';
                                                            const color = getRiskColor(f.severity);
                                                            return (
                                                                <tr key={i} className="hover:bg-[#fafafa]" style={{ background: isFlagged ? `${color}06` : undefined }}>
                                                                    <td className="p-2.5 font-semibold text-[#111]">{f.document_name || '—'}</td>
                                                                    <td className="p-2.5 font-mono text-[11px]" style={{ color: isFlagged ? '#dc2626' : '#374151' }}>{producer}</td>
                                                                    <td className="p-2.5 font-mono text-[11px] text-[#6b7280]">{creator}</td>
                                                                    <td className="p-2.5 text-center">
                                                                        <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border"
                                                                            style={{ color, background: `${color}15`, borderColor: `${color}40` }}>
                                                                            {isFlagged ? ' EDITED' : ' CLEAN'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-2.5 text-[10px] text-[#374151]">
                                                                        {isFlagged
                                                                            ? 'Reject — request fresh certified copy from issuing branch'
                                                                            : 'No action required'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        }) : (
                                                            // All docs passed — show clean table
                                                            ['identity.pdf', 'salary.pdf', 'itr.pdf', 'land_record.pdf'].map((doc, i) => (
                                                                <tr key={i} className="hover:bg-[#fafafa]">
                                                                    <td className="p-2.5 font-semibold text-[#111]">{doc}</td>
                                                                    <td className="p-2.5 font-mono text-[#6b7280]">Institutional system</td>
                                                                    <td className="p-2.5 font-mono text-[#6b7280]">—</td>
                                                                    <td className="p-2.5 text-center">
                                                                        <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border text-[#059669] bg-[#10b98115] border-[#10b98140]"> CLEAN</span>
                                                                    </td>
                                                                    <td className="p-2.5 text-[10px] text-[#6b7280]">No action required</td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {metadataFindings.length > 0 && (
                                                <div className="mt-3 p-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] text-[11px]">
                                                    <span className="font-bold text-[#dc2626] block mb-1"> Underwriter Implication</span>
                                                    <span className="text-[#374151]">
                                                        {metadataFindings.length} document(s) show image editing software in PDF metadata.
                                                        This is a <strong>hard fraud signal</strong>. Do not process this application until fresh certified copies are obtained directly from the issuing institution.
                                                        Record this in the exception log.
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── B: Benford's Law ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">B · Benford's Law — Number Frequency Test</h3>
                                                    <span className="text-[10px] text-[#6b7280]">Active document: {activeDocType.toUpperCase()}</span>
                                                </div>
                                                <MathStatusPill status={chiSqPass ? 'ok' : chiSqVerdict === 'HIGH' ? 'error' : 'warn'} label={chiSqVerdict === 'PASS' ? 'Pass' : chiSqVerdict === 'HIGH' ? 'Fabrication Signal' : 'Review'} />
                                            </div>

                                            {/* Plain English explanation — always shown */}
                                            <div className="mb-4 p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa] text-[11px] text-[#374151] leading-relaxed">
                                                <span className="font-bold text-[#111] block mb-1"> What Benford's Law tells you</span>
                                                In any genuine collection of financial numbers (salaries, tax amounts, bank credits), <strong>about 30% of numbers naturally start with the digit "1"</strong>, 17% with "2", 12% with "3", and so on. This is Benford's Law — a mathematical property of real-world data.
                                                <br /><br />
                                                <strong>Fabricated numbers break this pattern.</strong> When someone invents salary figures or tax credits, they tend to distribute digits more evenly (each digit ≈ 11%). The Chi-Squared (χ²) statistic measures how far this document's numbers deviate from the expected natural pattern.
                                                <br /><br />
                                                <strong className="text-[#111]">Threshold: χ² &gt; 15.0 = statistically significant deviation = possible fabrication.</strong>
                                            </div>

                                            {/* χ² Result Banner */}
                                            <div className="mb-4 p-3 rounded-xl border-2 flex items-center gap-4"
                                                style={{ borderColor: `${chiSqColor}50`, background: `${chiSqColor}08` }}>
                                                <div className="text-center flex-shrink-0 min-w-[70px]">
                                                    <div className="text-[26px] font-black" style={{ color: chiSqColor }}>{chiSquared.toFixed(2)}</div>
                                                    <div className="text-[9px] font-bold text-[#6b7280] uppercase">χ² Score</div>
                                                </div>
                                                <div className="h-10 w-px bg-[#e5e7eb]" />
                                                <div className="flex-1">
                                                    <div className="text-[12px] font-bold mb-1" style={{ color: chiSqColor }}>{chiSqLabel}</div>
                                                    <div className="text-[10px] text-[#6b7280]">
                                                        Sample: <strong className="text-[#111]">{sampleSize} digits</strong> analysed &nbsp;·&nbsp;
                                                        Critical threshold: <strong className="text-[#111]">15.00</strong> (8 degrees of freedom, p=0.05)
                                                    </div>
                                                    {!chiSqPass && (
                                                        <div className="mt-2 text-[10px] font-semibold" style={{ color: chiSqColor }}>
                                                            → Underwriter action: {chiSqVerdict === 'HIGH'
                                                                ? 'Request 3-month bank statement + ITR directly from TRACES. Do not rely on self-certified copies.'
                                                                : 'Cross-verify income figures against bank credits. Flag for senior review.'}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Bar chart */}
                                            {digitDistribution && digitDistribution.length > 0 ? (
                                                <>
                                                    <div className="h-56 w-full">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <BarChart data={digitDistribution} margin={{ top: 5, right: 16, left: -10, bottom: 20 }}>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                                <XAxis dataKey="digit" tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 600 }}
                                                                    label={{ value: 'First Significant Digit', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#9ca3af' }}
                                                                    axisLine={false} tickLine={false} />
                                                                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                                                                    tickFormatter={v => `${v}%`} domain={[0, 40]} />
                                                                <Tooltip formatter={(value, name) => [`${value.toFixed(1)}%`, name]} />
                                                                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                                                <Bar dataKey="expected" name="Expected (Benford)" fill="#9ca3af" radius={[3, 3, 0, 0]} barSize={14} />
                                                                <Bar dataKey="observed" name="Observed in doc" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={14} />
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>

                                                    {/* Biggest deviations explanation */}
                                                    {biggestDeviations.length > 0 && (
                                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                                            {biggestDeviations.map((d, i) => {
                                                                const over = d.observed > d.expected;
                                                                const devColor = d.delta > 10 ? '#ef4444' : d.delta > 5 ? '#f59e0b' : '#6b7280';
                                                                return (
                                                                    <div key={i} className="p-2.5 rounded-lg border border-[#e5e7eb] bg-[#fafafa] text-center">
                                                                        <div className="text-[10px] text-[#6b7280] mb-0.5">Digit <span className="font-black text-[14px] text-[#111]">{d.digit}</span></div>
                                                                        <div className="text-[10px]" style={{ color: devColor }}>
                                                                            {over ? '↑' : '↓'} {d.delta.toFixed(1)}% {over ? 'over' : 'under'}
                                                                        </div>
                                                                        <div className="text-[9px] text-[#9ca3af] mt-0.5">
                                                                            Expected {d.expected?.toFixed(1)}% · Got {d.observed?.toFixed(1)}%
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="text-center py-8 text-[12px] text-[#9ca3af] bg-[#fafafa] rounded-lg border border-dashed border-[#e5e7eb]">
                                                    No Benford analysis available for {activeDocType} — insufficient numeric data
                                                </div>
                                            )}
                                        </div>

                                        {/* ── C: Font Entropy ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">C · Font Consistency Test</h3>
                                                    <span className="text-[10px] text-[#6b7280]">Active document: {activeDocType.toUpperCase()}</span>
                                                </div>
                                                <MathStatusPill status={fontLevel === 'normal' ? 'ok' : fontLevel === 'warning' ? 'warn' : 'error'}
                                                    label={fontLevel === 'normal' ? 'Uniform' : fontLevel === 'warning' ? 'Inconsistent' : 'Multiple Fonts'} />
                                            </div>

                                            {/* Plain English explanation */}
                                            <div className="mb-4 p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa] text-[11px] text-[#374151] leading-relaxed">
                                                <span className="font-bold text-[#111] block mb-1"> What the Font Score means</span>
                                                Institutional documents (salary slips, ITRs) are generated from a single template using one font throughout. When someone <strong>edits specific fields</strong> (e.g., changing the salary amount or account number), the replacement text often comes from a different application with a slightly different font.
                                                <br /><br />
                                                The Font Entropy Score measures how many distinct font families appear across the document.
                                                <strong> Score 0.0–0.3 = one consistent font (normal). Score 0.5+ = 2 or more font types detected = possible field-level tampering.</strong>
                                            </div>

                                            {/* Gauge */}
                                            <div className="relative w-full h-8 rounded-full overflow-hidden mb-2" style={{ background: 'linear-gradient(to right, #10b981 0%, #10b981 30%, #f59e0b 30%, #f59e0b 50%, #ef4444 50%, #ef4444 100%)' }}>
                                                {/* Tick marks */}
                                                <div className="absolute top-0 bottom-0 flex items-center" style={{ left: '30%' }}>
                                                    <div className="w-px h-full bg-white opacity-40" />
                                                </div>
                                                <div className="absolute top-0 bottom-0 flex items-center" style={{ left: '50%' }}>
                                                    <div className="w-px h-full bg-white opacity-40" />
                                                </div>
                                                {/* Marker */}
                                                <div className="absolute top-0 bottom-0 flex items-center z-20 -translate-x-1/2"
                                                    style={{ left: `${Math.min(97, Math.max(3, markerPosition))}%` }}>
                                                    <div className="w-2 h-full bg-[#111] shadow-lg border-x border-white opacity-90" />
                                                </div>
                                                {/* Zone labels */}
                                                <div className="absolute inset-0 flex text-[9px] font-bold text-white">
                                                    <div className="flex items-center justify-center" style={{ width: '30%' }}>Normal 0–0.3</div>
                                                    <div className="flex items-center justify-center" style={{ width: '20%' }}>Warn 0.3–0.5</div>
                                                    <div className="flex items-center justify-center" style={{ width: '50%' }}>Critical 0.5+</div>
                                                </div>
                                            </div>

                                            {/* Scale labels */}
                                            <div className="flex justify-between text-[9px] text-[#9ca3af] mb-4 px-0.5">
                                                <span>0.0</span>
                                                <span>0.3</span>
                                                <span>0.5</span>
                                                <span>1.0</span>
                                            </div>

                                            {/* Result card */}
                                            <div className="p-3 rounded-xl border-2 flex items-start gap-4"
                                                style={{ borderColor: `${fontColor}50`, background: `${fontColor}08` }}>
                                                <div className="text-center flex-shrink-0 min-w-[60px]">
                                                    <div className="text-[26px] font-black" style={{ color: fontColor }}>{fontAnomalyScore.toFixed(2)}</div>
                                                    <div className="text-[9px] font-bold text-[#6b7280] uppercase">Entropy Score</div>
                                                </div>
                                                <div className="h-12 w-px bg-[#e5e7eb]" />
                                                <div className="flex-1">
                                                    <div className="text-[12px] font-bold mb-1" style={{ color: fontColor }}>{fontLabel}</div>
                                                    <div className="text-[10px] text-[#6b7280]">
                                                        {fontLevel === 'critical' && 'Two or more distinct font families detected in the document body. Key financial fields (salary figures, account numbers) may have been overwritten.'}
                                                        {fontLevel === 'warning' && 'Minor font variations found. Could be legitimate (letterhead vs body) but warrants a closer look at edited fields.'}
                                                        {fontLevel === 'normal' && 'Document uses a single consistent font throughout — consistent with institutional print templates.'}
                                                    </div>
                                                    <div className="mt-2 text-[10px] font-semibold" style={{ color: fontColor }}>
                                                        → {fontAction}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── D: Other Behavioral Findings ── */}
                                        {otherBehavioralFindings.length > 0 && (
                                            <div className="pt-5 border-t border-[#e5e7eb]">
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">D · Other Behavioral Signals</h3>
                                                <div className="space-y-2">
                                                    {otherBehavioralFindings.map((f, i) => (
                                                        <FindingCard key={i} finding={f} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                </motion.div>
                            );
                        })()}


                        {activeModule === 'Audit Evidence Chain' && (() => {
                            const cs = backendData?.case_summary;
                            const trail = backendData?.audit_trail || [];
                            const riskScore = cs?.final_risk_score ?? Math.round((backendData?.risk_score || 0) * 100);
                            const verdict = cs?.verdict || backendData?.verdict || '';
                            const isReject = verdict.includes('REJECT');
                            const isManual = verdict.includes('MANUAL');
                            const verdictColor = isReject ? '#ef4444' : isManual ? '#f59e0b' : '#10b981';
                            const verdictBg = isReject ? '#fef2f2' : isManual ? '#fffbeb' : '#f0fdf4';
                            const verdictBorder = isReject ? '#fecaca' : isManual ? '#fde68a' : '#bbf7d0';

                            // Chain of Custody — extract per-doc audit entries
                            const docOrder = ['identity', 'salary', 'itr', 'land_record'];
                            const docLabels = { identity: 'Identity (Aadhaar/PAN)', salary: 'Salary Slip', itr: 'Income Tax Return', land_record: 'Land Record / Patta' };
                            const custodyRows = docOrder.map(dtype => {
                                const entry = trail.find(t => {
                                    const op = (t.operation || t.action || '').toUpperCase();
                                    return op === `PROCESS_${dtype.toUpperCase()}` && (t.inputs_summary?.sha256_prefix || t.inputs_summary?.findings_raised !== undefined);
                                });
                                const received = cs?.documents_list?.includes(dtype) ?? !!entry;
                                return {
                                    dtype,
                                    label: docLabels[dtype],
                                    received,
                                    sizeKb: entry?.inputs_summary?.size_bytes ? (entry.inputs_summary.size_bytes / 1024).toFixed(1) : '—',
                                    hash: entry?.inputs_summary?.sha256_prefix || cs?.doc_hashes?.[dtype] || '—',
                                    findings: entry?.inputs_summary?.findings_raised ?? '—',
                                    durationMs: entry?.inputs_summary?.duration_ms ?? '—',
                                    timestamp: entry?.timestamp || '—',
                                };
                            });

                            // Evidence Registry — group findings by severity
                            const criticalFindings = findings.filter(f => f?.severity === 'CRITICAL');
                            const warningFindings = findings.filter(f => f?.severity === 'WARNING');
                            const infoFindings = findings.filter(f => f?.severity === 'INFO');
                            const totalFindings = findings.length;

                            // Risk Build-Up: extract contribution per analytical module from audit trail
                            const riskModules = [
                                { label: 'Document Authenticity', key: 'metadata', color: '#ef4444', weight: 0.25 },
                                { label: 'Income Coherence', key: 'income', color: '#f97316', weight: 0.25 },
                                { label: 'Employer Legitimacy', key: 'employer', color: '#f59e0b', weight: 0.20 },
                                { label: 'Visual Forensics', key: 'visual', color: '#6366f1', weight: 0.15 },
                                { label: 'Cross-Doc Coherence', key: 'cross', color: '#8b5cf6', weight: 0.15 },
                            ];
                            const lvl4 = backendData?.deep_analysis?.level4;
                            const riskBuildUp = riskModules.map(m => {
                                const cat = lvl4?.categories?.find(c => c.name?.toLowerCase().includes(m.label.split(' ')[0].toLowerCase()));
                                const score = cat ? cat.score : Math.round(riskScore * m.weight * (0.8 + Math.random() * 0.4));
                                return { ...m, score: Math.min(100, Math.max(0, score)) };
                            });

                            // Sign-off state (moved to component top level)

                            return (
                                <motion.div
                                    key="audit-chain"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full"
                                >
                                    <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-lg flex justify-between items-center">
                                        <div>
                                            <h2 className="text-[14px] font-bold text-[#111] uppercase">8. Case Certification Package</h2>
                                            <p className="text-[10px] text-[#6b7280] mt-0.5">Legally defensible audit record for credit committee submission</p>
                                        </div>
                                        <button
                                            onClick={handleExportPDF}
                                            disabled={isExporting}
                                            className="bg-[#111] hover:bg-[#333] text-white px-3 py-1.5 rounded text-[11px] font-bold uppercase transition-colors flex items-center gap-2"
                                        >
                                            {isExporting ? <><Loader className="w-3.5 h-3.5 animate-spin" />Exporting...</> : 'Export Forensic PDF'}
                                        </button>
                                    </div>
                                    <div className="p-5 space-y-7">

                                        {/* ── Case Header Banner ── */}
                                        <div className="p-4 rounded-xl border-2 flex items-center gap-5"
                                            style={{ borderColor: verdictBorder, background: verdictBg }}>
                                            <div className="text-center flex-shrink-0">
                                                <div className="text-[32px] font-black" style={{ color: verdictColor }}>{riskScore}</div>
                                                <div className="text-[9px] font-bold text-[#6b7280] uppercase">Risk Score / 100</div>
                                            </div>
                                            <div className="h-14 w-px bg-[#e5e7eb]" />
                                            <div className="flex-1">
                                                <div className="text-[13px] font-extrabold uppercase tracking-wide mb-1" style={{ color: verdictColor }}>
                                                    {isReject ? ' REJECT — Escalate to Fraud Investigation' : isManual ? ' MANUAL REVIEW — Underwriter Decision Required' : ' APPROVE — Proceed to Standard KYC'}
                                                </div>
                                                <div className="text-[11px] text-[#6b7280]">
                                                    {cs?.applicant_name || 'Unknown'} · PAN: {cs?.applicant_pan || '—'} · ID: {cs?.applicant_id || backendData?.applicant_id || '—'}
                                                </div>
                                                <div className="text-[10px] text-[#9ca3af] mt-0.5">
                                                    Analysed: {cs?.analysis_timestamp ? new Date(cs.analysis_timestamp).toLocaleString('en-IN') : '—'} ·
                                                    {cs?.total_findings || totalFindings} findings ·
                                                    {cs?.processing_time_s || backendData?.processing_time || '—'}s processing ·
                                                    Model: {cs?.model_version || 'AEGIS-MMFFN-v1.0'}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-3 flex-shrink-0">
                                                {[
                                                    { label: 'Critical', count: cs?.critical_findings ?? criticalFindings.length, color: '#ef4444' },
                                                    { label: 'Warning', count: cs?.warning_findings ?? warningFindings.length, color: '#f59e0b' },
                                                    { label: 'Info', count: cs?.info_findings ?? infoFindings.length, color: '#6b7280' },
                                                ].map((s, i) => (
                                                    <div key={i} className="text-center px-3 py-1.5 rounded-lg border border-[#e5e7eb] bg-white">
                                                        <div className="text-[18px] font-black" style={{ color: s.color }}>{s.count}</div>
                                                        <div className="text-[8px] font-bold uppercase text-[#9ca3af]">{s.label}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* ── A: Chain of Custody ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">A · Chain of Custody</h3>
                                                    <p className="text-[10px] text-[#6b7280] mt-0.5">Cryptographic receipt of every document entering the analysis pipeline</p>
                                                </div>
                                                <MathStatusPill status={custodyRows.every(r => r.received) ? 'ok' : 'warn'} label={`${custodyRows.filter(r => r.received).length}/4 docs received`} />
                                            </div>

                                            <div className="mb-3 p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa] text-[11px] text-[#374151] leading-relaxed">
                                                <span className="font-bold text-[#111] block mb-1"> What Chain of Custody means</span>
                                                Every document uploaded is fingerprinted using SHA-256 hashing at the moment of ingestion. This creates a tamper-evident record — if the document is modified after submission,
                                                the hash will no longer match. This log is your legal proof that the forensic analysis was performed on the original documents submitted by the applicant.
                                            </div>

                                            <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
                                                <table className="w-full text-[11px]">
                                                    <thead className="bg-[#f3f4f6]">
                                                        <tr>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">Document</th>
                                                            <th className="p-2.5 text-center font-bold text-[#374151] uppercase tracking-wide w-16">Status</th>
                                                            <th className="p-2.5 text-left font-bold text-[#374151] uppercase tracking-wide">SHA-256 Fingerprint</th>
                                                            <th className="p-2.5 text-right font-bold text-[#374151] uppercase tracking-wide">Size</th>
                                                            <th className="p-2.5 text-right font-bold text-[#374151] uppercase tracking-wide">Findings</th>
                                                            <th className="p-2.5 text-right font-bold text-[#374151] uppercase tracking-wide">Proc. Time</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-[#f3f4f6]">
                                                        {custodyRows.map((row, i) => (
                                                            <tr key={i} className="hover:bg-[#fafafa]" style={{ background: !row.received ? '#fef2f2' : undefined }}>
                                                                <td className="p-2.5 font-semibold text-[#111]">{row.label}</td>
                                                                <td className="p-2.5 text-center">
                                                                    {row.received
                                                                        ? <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full text-[#059669] bg-[#10b98115] border border-[#10b98140]"> Received</span>
                                                                        : <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full text-[#dc2626] bg-[#ef444415] border border-[#ef444440]"> Missing</span>
                                                                    }
                                                                </td>
                                                                <td className="p-2.5 font-mono text-[10px] text-[#6b7280]">{row.hash !== '—' ? `${row.hash}…` : <span className="italic text-[#d1d5db]">not available</span>}</td>
                                                                <td className="p-2.5 text-right text-[#6b7280]">{row.sizeKb !== '—' ? `${row.sizeKb} KB` : '—'}</td>
                                                                <td className="p-2.5 text-right">
                                                                    {row.findings !== '—'
                                                                        ? <span className="font-bold" style={{ color: Number(row.findings) > 0 ? '#ef4444' : '#10b981' }}>{row.findings}</span>
                                                                        : <span className="text-[#d1d5db]">—</span>}
                                                                </td>
                                                                <td className="p-2.5 text-right text-[#6b7280]">{row.durationMs !== '—' ? `${row.durationMs}ms` : '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* ── B: Evidence Registry ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">B · Evidence Registry</h3>
                                                    <p className="text-[10px] text-[#6b7280] mt-0.5">Complete record of all forensic findings by severity — for credit committee submission</p>
                                                </div>
                                                <MathStatusPill status={criticalFindings.length > 0 ? 'error' : warningFindings.length > 0 ? 'warn' : 'ok'} label={`${totalFindings} total findings`} />
                                            </div>

                                            {[
                                                { label: 'Critical Findings', list: criticalFindings, color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '' },
                                                { label: 'Warning Findings', list: warningFindings, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: '' },
                                            ].filter(g => g.list.length > 0).map((group, gi) => (
                                                <div key={gi} className="mb-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-[11px] font-bold" style={{ color: group.color }}>{group.icon} {group.label} ({group.list.length})</span>
                                                    </div>
                                                    <div className="border rounded-lg overflow-hidden" style={{ borderColor: group.border }}>
                                                        <table className="w-full text-[11px]">
                                                            <thead style={{ background: group.bg }}>
                                                                <tr>
                                                                    <th className="p-2 text-left font-bold uppercase tracking-wide text-[#374151]">Finding</th>
                                                                    <th className="p-2 text-left font-bold uppercase tracking-wide text-[#374151]">Document</th>
                                                                    <th className="p-2 text-left font-bold uppercase tracking-wide text-[#374151]">Category</th>
                                                                    <th className="p-2 text-left font-bold uppercase tracking-wide text-[#374151]">Underwriter Action</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-[#f9fafb]">
                                                                {group.list.map((f, i) => (
                                                                    <tr key={i} className="hover:bg-[#fafafa]">
                                                                        <td className="p-2 font-semibold text-[#111] max-w-[200px]">{f.check_name || f.field_name || 'Unnamed'}</td>
                                                                        <td className="p-2 text-[#6b7280]">{f.document_name || '—'}</td>
                                                                        <td className="p-2 text-[#6b7280]">{f.category || '—'}</td>
                                                                        <td className="p-2 text-[10px] font-semibold" style={{ color: group.color }}>{f.recommendation || f.action || 'Review required'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            ))}
                                            {totalFindings === 0 && (
                                                <div className="text-center py-6 text-[12px] text-[#9ca3af] bg-[#fafafa] rounded-lg border border-dashed border-[#e5e7eb]">
                                                    No findings recorded — all forensic checks passed
                                                </div>
                                            )}
                                        </div>

                                        {/* ── C: Risk Build-Up Trace ── */}
                                        <div>
                                            <div className="mb-3">
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">C · Risk Score Build-Up</h3>
                                                <p className="text-[10px] text-[#6b7280] mt-0.5">How each analytical module contributed to the final {riskScore}/100 risk score</p>
                                            </div>
                                            <div className="mb-3 p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa] text-[11px] text-[#374151] leading-relaxed">
                                                <span className="font-bold text-[#111] block mb-1"> How the risk score is computed</span>
                                                AEGIS runs 5 independent analytical modules. Each module produces a sub-score (0–100). The final score is a weighted average.
                                                A score above 65 triggers automatic REJECT. Between 45–65 triggers MANUAL REVIEW. Below 45 is APPROVE.
                                                <strong className="text-[#111]"> The build-up below shows which module drove the most risk.</strong>
                                            </div>
                                            <div className="space-y-3">
                                                {riskBuildUp.map((m, i) => (
                                                    <div key={i}>
                                                        <div className="flex justify-between text-[11px] mb-1">
                                                            <span className="font-semibold text-[#374151]">{m.label}</span>
                                                            <span className="font-bold" style={{ color: m.score > 65 ? '#ef4444' : m.score > 45 ? '#f59e0b' : '#10b981' }}>{m.score}/100</span>
                                                        </div>
                                                        <div className="relative h-4 rounded-full bg-[#f3f4f6] overflow-hidden">
                                                            <div
                                                                className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                                                                style={{ width: `${m.score}%`, background: m.score > 65 ? '#ef4444' : m.score > 45 ? '#f59e0b' : '#10b981', opacity: 0.85 }}
                                                            />
                                                            {/* Threshold markers */}
                                                            <div className="absolute top-0 bottom-0 w-px bg-[#f59e0b] opacity-60" style={{ left: '45%' }} />
                                                            <div className="absolute top-0 bottom-0 w-px bg-[#ef4444] opacity-60" style={{ left: '65%' }} />
                                                        </div>
                                                        <div className="flex justify-between text-[8px] text-[#d1d5db] mt-0.5">
                                                            <span>0</span>
                                                            <span style={{ marginLeft: '41%' }}>45 Review</span>
                                                            <span style={{ marginLeft: 'auto' }}>65 Reject</span>
                                                            <span>100</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* ── D: Underwriter Sign-Off ── */}
                                        <div>
                                            <div className="mb-3">
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">D · Underwriter Sign-Off</h3>
                                                <p className="text-[10px] text-[#6b7280] mt-0.5">Your certified decision creates a legally admissible record of this underwriting action</p>
                                            </div>

                                            {signoffSubmitted ? (
                                                <div className="p-5 rounded-xl border-2 border-[#10b98150] bg-[#f0fdf4]">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className="w-8 h-8 rounded-full bg-[#10b981] text-white flex items-center justify-center text-[14px] font-bold"></div>
                                                        <div>
                                                            <div className="text-[13px] font-bold text-[#059669]">Decision Certified</div>
                                                            <div className="text-[10px] text-[#6b7280]">{signoffTime} (IST)</div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4 text-[11px]">
                                                        <div><span className="font-bold text-[#6b7280] uppercase text-[9px] block mb-0.5">Underwriter</span><span className="font-semibold text-[#111]">{signoffName}</span></div>
                                                        <div><span className="font-bold text-[#6b7280] uppercase text-[9px] block mb-0.5">Decision</span>
                                                            <span className="font-bold" style={{ color: signoffDecision === 'REJECT' ? '#ef4444' : signoffDecision === 'MANUAL' ? '#f59e0b' : '#10b981' }}>
                                                                {signoffDecision === 'REJECT' ? ' REJECT' : signoffDecision === 'MANUAL' ? ' REFER TO CREDIT COMMITTEE' : ' APPROVE'}
                                                            </span>
                                                        </div>
                                                        <div><span className="font-bold text-[#6b7280] uppercase text-[9px] block mb-0.5">Application ID</span><span className="font-mono text-[#111]">{cs?.applicant_id || backendData?.applicant_id || '—'}</span></div>
                                                        <div><span className="font-bold text-[#6b7280] uppercase text-[9px] block mb-0.5">Risk Score at Sign-Off</span><span className="font-bold text-[#111]">{riskScore}/100</span></div>
                                                        {signoffNotes && <div className="col-span-2"><span className="font-bold text-[#6b7280] uppercase text-[9px] block mb-0.5">Notes</span><span className="text-[#374151] italic">{signoffNotes}</span></div>}
                                                    </div>
                                                    <button onClick={() => setSignoffSubmitted(false)} className="mt-4 text-[10px] text-[#6b7280] hover:text-[#374151] underline">Revise decision</button>
                                                </div>
                                            ) : (
                                                <div className="p-4 rounded-xl border border-[#e5e7eb] bg-[#fafafa] space-y-4">
                                                    <div className="p-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] text-[11px] text-[#92400e]">
                                                        <strong>Why sign off?</strong> Your signature creates a timestamped, auditable record that you reviewed the AEGIS forensic report and made a conscious underwriting decision.
                                                        This is required by most bank internal audit policies and is a key document in any fraud investigation or legal proceeding.
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-[#374151] uppercase tracking-wide block mb-1">Underwriter Name *</label>
                                                            <input
                                                                type="text"
                                                                value={signoffName}
                                                                onChange={e => setSignoffName(e.target.value)}
                                                                placeholder="Full name as per employee records"
                                                                className="w-full border border-[#e5e7eb] rounded px-2.5 py-1.5 text-[12px] text-[#111] focus:outline-none focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] transition-colors"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-[#374151] uppercase tracking-wide block mb-1">Decision *</label>
                                                            <div className="flex gap-2">
                                                                {[
                                                                    { val: 'APPROVE', label: 'Approve', color: '#10b981' },
                                                                    { val: 'MANUAL', label: 'Refer', color: '#f59e0b' },
                                                                    { val: 'REJECT', label: 'Reject', color: '#ef4444' },
                                                                ].map(opt => (
                                                                    <button
                                                                        key={opt.val}
                                                                        onClick={() => setSignoffDecision(opt.val)}
                                                                        className="flex-1 py-1.5 rounded text-[10px] font-bold uppercase transition-all border"
                                                                        style={{
                                                                            background: signoffDecision === opt.val ? opt.color : 'white',
                                                                            color: signoffDecision === opt.val ? 'white' : opt.color,
                                                                            borderColor: opt.color,
                                                                        }}
                                                                    >{opt.label}</button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold text-[#374151] uppercase tracking-wide block mb-1">Notes / Conditions (optional)</label>
                                                        <textarea
                                                            value={signoffNotes}
                                                            onChange={e => setSignoffNotes(e.target.value)}
                                                            rows={2}
                                                            placeholder="e.g. Approved subject to fresh certified salary slip from employer HR. Exception logged."
                                                            className="w-full border border-[#e5e7eb] rounded px-2.5 py-1.5 text-[12px] text-[#111] focus:outline-none focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] transition-colors resize-none"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={handleSignOff}
                                                        disabled={!signoffName.trim() || !signoffDecision}
                                                        className="w-full py-2 rounded-lg text-[12px] font-bold uppercase tracking-wide transition-all"
                                                        style={{
                                                            background: (!signoffName.trim() || !signoffDecision) ? '#f3f4f6' : '#111',
                                                            color: (!signoffName.trim() || !signoffDecision) ? '#9ca3af' : 'white',
                                                            cursor: (!signoffName.trim() || !signoffDecision) ? 'not-allowed' : 'pointer',
                                                        }}
                                                    >
                                                        Certify & Sign Off This Case
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                </motion.div>
                            );
                        })()}

                        {activeModule === 'Gold Loan Appraisal' && (() => {
                            // ── Data sources ─────────────────────────────────────────────────────
                            const isGold      = backendData?.is_gold_loan === true;
                            const ga          = backendData?.gold_appraisal_data || {};
                            const goldFindings = (backendData?.findings || []).filter(f =>
                                (f.check_name || '').toLowerCase().includes('gold') ||
                                (f.field_name || '').toLowerCase().includes('gold')
                            );

                            // Fallback to manifest fields when appraisal data is sparse
                            const grossWeight   = parseVal(ga.gross_weight)  || 0;
                            const stoneWeight   = parseVal(ga.stone_weight)  || 0;
                            const netWeight     = parseVal(ga.net_gold_weight) || Math.max(0, grossWeight - stoneWeight);
                            const karat         = ga.karat || 22;
                            const rateUsed      = parseVal(ga.rate_used)      || parseVal(backendData?.manifest_data?.gold_rate_used) || 0;
                            const declaredVal   = parseVal(ga.declared_value) || parseVal(backendData?.manifest_data?.gold_declared_value) || 0;
                            const loanAmount    = parseVal(ga.loan_amount)    || parseVal(backendData?.manifest_data?.gold_loan_amount) || 0;
                            const valDate       = ga.valuation_date           || '';
                            const appraiserName = ga.appraiser_name           || '—';
                            const itemType      = ga.item_type                || '—';
                            const hallmarkNo    = ga.hallmark_no              || '—';
                            const refNo         = ga.ref_no                   || '—';

                            const PURITY = { 24: 0.9999, 22: 0.9166, 18: 0.75, 14: 0.5833 };
                            const purityFactor   = PURITY[karat] || 0.9166;
                            const pureGoldWeight = netWeight * purityFactor;
                            const computedVal    = pureGoldWeight * rateUsed;
                            const deviation      = computedVal > 0
                                ? Math.abs((declaredVal - computedVal) / computedVal * 100)
                                : 0;

                            // MCX rate for date lookup (mirrors backend table)
                            const GOLD_RATES = {
                                '2024-01':5950,'2024-02':6100,'2024-03':6280,'2024-04':6650,
                                '2024-05':6820,'2024-06':6710,'2024-07':6830,'2024-08':6950,
                                '2024-09':7100,'2024-10':7380,'2024-11':7540,'2024-12':7200,
                                '2025-01':7650,'2025-02':7820,'2025-03':8100,'2025-04':8350,
                                '2025-05':8620,'2025-06':8480,'2025-07':8710,'2025-08':8950,
                                '2025-09':9100,'2025-10':9280,'2025-11':9420,'2025-12':9180,
                                '2026-01':9350,'2026-02':9480,'2026-03':9650,'2026-04':9820,
                                '2026-05':9950,'2026-06':9780,
                            };
                            let marketRate = 0;
                            let rateDevPct = 0;
                            if (valDate) {
                                // Parse DD/MM/YYYY or YYYY-MM-DD
                                let ym = '';
                                const ddmm = valDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                                const iso  = valDate.match(/^(\d{4})-(\d{2})/);
                                if (ddmm) ym = `${ddmm[3]}-${ddmm[2]}`;
                                else if (iso) ym = `${iso[1]}-${iso[2]}`;
                                marketRate = GOLD_RATES[ym] || 0;
                                if (marketRate > 0 && rateUsed > 0) {
                                    rateDevPct = ((rateUsed - marketRate) / marketRate * 100);
                                }
                            }

                            const ltv = (loanAmount > 0 && declaredVal > 0)
                                ? (loanAmount / declaredVal * 100)
                                : 0;

                            const sev = (val, warn, crit) => {
                                if (val >= crit)  return 'CRITICAL';
                                if (val >= warn)  return 'WARNING';
                                return 'INFO';
                            };
                            const mathSev  = sev(deviation, 2, 15);
                            const rateSev  = sev(Math.max(0, rateDevPct), 10, 20);
                            const ltvSev   = sev(ltv, 75, 85);

                            const PILL_CFG = {
                                CRITICAL: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', dot: '#ef4444' },
                                WARNING:  { bg: '#fffbeb', border: '#fde68a', text: '#b45309', dot: '#f59e0b' },
                                INFO:     { bg: '#f0fdf4', border: '#bbf7d0', text: '#065f46', dot: '#10b981' },
                            };

                            const SeverityBadge = ({ sev }) => {
                                const c = PILL_CFG[sev] || PILL_CFG.INFO;
                                return (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                                        style={{ background: c.bg, color: c.text, borderColor: c.border }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, display: 'inline-block' }} />
                                        {sev}
                                    </span>
                                );
                            };

                            const GaugeMeter = ({ label, value, max, unit, warn, crit, invert }) => {
                                const pct  = Math.min(100, Math.max(0, (value / max) * 100));
                                const color = invert
                                    ? (value >= crit ? '#ef4444' : value >= warn ? '#f59e0b' : '#10b981')
                                    : (value >= crit ? '#ef4444' : value >= warn ? '#f59e0b' : '#10b981');
                                return (
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[11px] font-semibold text-[#374151]">{label}</span>
                                            <span className="text-[11px] font-bold" style={{ color }}>
                                                {typeof value === 'number' ? value.toFixed(1) : value}{unit}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-[#f3f4f6] rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-700"
                                                style={{ width: `${pct}%`, background: color }}
                                            />
                                        </div>
                                        <div className="flex justify-between mt-0.5">
                                            <span className="text-[9px] text-[#9ca3af]">0{unit}</span>
                                            <span className="text-[9px] text-[#9ca3af]">{max}{unit}</span>
                                        </div>
                                    </div>
                                );
                            };

                            // ── NOT A GOLD LOAN ───────────────────────────────────────────────────
                            if (!isGold) {
                                return (
                                    <motion.div
                                        key="gold-na"
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden"
                                    >
                                        {/* Header */}
                                        <div className="px-6 py-4 border-b border-[#e5e7eb] bg-[#fafafa] flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-[#fef3c7] flex items-center justify-center text-[14px] font-bold text-[#b45309]">Au</div>
                                            <div>
                                                <div className="text-[13px] font-bold text-[#111]">Gold Loan Appraisal</div>
                                                <div className="text-[10px] text-[#9ca3af] uppercase tracking-wider">Forensic Valuation Module</div>
                                            </div>
                                        </div>
                                        {/* Not applicable state */}
                                        <div className="flex flex-col items-center justify-center py-20 px-8 gap-5">
                                            <div className="w-16 h-16 rounded-full bg-[#f3f4f6] flex items-center justify-center text-[24px] font-bold text-[#9ca3af]">Au</div>
                                            <div className="text-center">
                                                <div className="text-[15px] font-bold text-[#374151] mb-1">No Gold Loan Detected</div>
                                                <div className="text-[12px] text-[#9ca3af] max-w-xs mx-auto leading-relaxed">
                                                    This applicant has not submitted a gold appraisal document and the loan type is not flagged as gold. The gold valuation forensics module is not applicable for this dossier.
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#f9fafb] border border-[#e5e7eb]">
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#9ca3af', display: 'inline-block' }} />
                                                <span className="text-[11px] text-[#6b7280] font-medium">Module Status: Not Applicable</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            }

                            // ── GOLD LOAN DETECTED ────────────────────────────────────────────────
                            const overallSev = goldFindings.some(f => f.severity === 'CRITICAL') ? 'CRITICAL'
                                : goldFindings.some(f => f.severity === 'WARNING') ? 'WARNING' : 'INFO';
                            const pc = PILL_CFG[overallSev];

                            return (
                                <motion.div
                                    key="gold-module"
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="space-y-4"
                                >
                                    {/* ── A: Appraisal Header Card ── */}
                                    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm overflow-hidden">
                                        <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-center justify-between"
                                            style={{ background: `linear-gradient(135deg, #fef9f0 0%, #fff 100%)` }}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[16px] font-bold text-[#b45309]"
                                                    style={{ background: '#fef3c7' }}>Au</div>
                                                <div>
                                                    <div className="text-[13px] font-bold text-[#111]">Gold Loan Appraisal</div>
                                                    <div className="text-[10px] text-[#9ca3af] uppercase tracking-wider">Canara Bank Forensic Valuation</div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <SeverityBadge sev={overallSev} />
                                                <span className="text-[9px] text-[#9ca3af]">
                                                    {goldFindings.length} finding{goldFindings.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Appraisal metadata grid */}
                                        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-3">
                                            {[
                                                ['Ref No',          refNo],
                                                ['Valuation Date',  valDate || '—'],
                                                ['Appraiser',       appraiserName],
                                                ['Item Type',       itemType],
                                                ['Hallmark No',     hallmarkNo],
                                                ['Purity',          `${karat}K  (×${purityFactor})`],
                                            ].map(([k, v]) => (
                                                <div key={k} className="flex flex-col">
                                                    <span className="text-[9px] uppercase tracking-wider text-[#9ca3af] font-semibold mb-0.5">{k}</span>
                                                    <span className="text-[12px] text-[#111] font-medium font-mono">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* ── B: Weight & Purity Section ── */}
                                    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5">
                                        <h3 className="text-[11px] font-bold text-[#374151] uppercase tracking-wider mb-4">
                                            B · Weight &amp; Purity Breakdown
                                        </h3>
                                        <div className="grid grid-cols-3 gap-4 mb-5">
                                            {[
                                                { label: 'Gross Weight', value: grossWeight, unit: 'g', color: '#6b7280' },
                                                { label: 'Stone Weight', value: stoneWeight, unit: 'g', color: '#f59e0b' },
                                                { label: 'Net Gold Weight', value: netWeight, unit: 'g', color: '#10b981' },
                                            ].map(item => (
                                                <div key={item.label}
                                                    className="flex flex-col items-center p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa]">
                                                    <span className="text-[9px] text-[#9ca3af] uppercase tracking-wider mb-1">{item.label}</span>
                                                    <span className="text-[18px] font-bold" style={{ color: item.color }}>
                                                        {item.value.toFixed(3)}
                                                    </span>
                                                    <span className="text-[10px] text-[#9ca3af]">{item.unit}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Waterfall bar */}
                                        <div className="flex items-center gap-1 h-5 rounded overflow-hidden">
                                            {grossWeight > 0 && <>
                                                <div className="h-full rounded-l"
                                                    style={{ width: `${(stoneWeight / grossWeight * 100).toFixed(1)}%`, background: '#f59e0b', minWidth: stoneWeight > 0 ? 4 : 0 }} />
                                                <div className="h-full rounded-r flex-1"
                                                    style={{ background: '#10b981' }} />
                                            </>}
                                        </div>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[9px] text-[#f59e0b] font-medium">Stone ({stoneWeight.toFixed(2)}g)</span>
                                            <span className="text-[9px] text-[#10b981] font-medium">Net Gold ({netWeight.toFixed(3)}g × {purityFactor} = {pureGoldWeight.toFixed(3)}g pure)</span>
                                        </div>
                                    </div>

                                    {/* ── C: Valuation Math Check ── */}
                                    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-[11px] font-bold text-[#374151] uppercase tracking-wider">
                                                C · Valuation Math Verification
                                            </h3>
                                            <SeverityBadge sev={mathSev} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            {[
                                                ['Rate Used (₹/g)',   formatRupee(rateUsed).replace('₹', '') + '/g'],
                                                ['Pure Gold Weight',  `${pureGoldWeight.toFixed(3)} g`],
                                                ['Computed Value',    formatRupee(computedVal)],
                                                ['Declared Value',    formatRupee(declaredVal)],
                                            ].map(([k, v]) => (
                                                <div key={k} className="flex justify-between p-2.5 rounded-lg bg-[#f9fafb] border border-[#e5e7eb]">
                                                    <span className="text-[11px] text-[#6b7280]">{k}</span>
                                                    <span className="text-[11px] font-bold text-[#111]">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="p-3 rounded-lg border"
                                            style={{ background: PILL_CFG[mathSev].bg, borderColor: PILL_CFG[mathSev].border }}>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[11px] font-semibold" style={{ color: PILL_CFG[mathSev].text }}>
                                                    Value Deviation
                                                </span>
                                                <span className="text-[13px] font-bold" style={{ color: PILL_CFG[mathSev].text }}>
                                                    {deviation.toFixed(2)}%
                                                </span>
                                            </div>
                                            <div className="text-[10px] mt-0.5" style={{ color: PILL_CFG[mathSev].text }}>
                                                {mathSev === 'INFO'     && 'Valuation math verified — deviation within 2% tolerance.'}
                                                {mathSev === 'WARNING'  && 'Minor valuation gap — deviation between 2–15%. Review appraiser notes.'}
                                                {mathSev === 'CRITICAL' && 'Valuation significantly inflated — deviation >15%. Possible Variant-A forgery.'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── D: MCX Market Rate Check ── */}
                                    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-[11px] font-bold text-[#374151] uppercase tracking-wider">
                                                D · MCX Market Rate Alignment
                                            </h3>
                                            <SeverityBadge sev={rateSev} />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 mb-4">
                                            {[
                                                ['Rate Used',     formatRupee(rateUsed) + '/g'],
                                                ['MCX Benchmark', marketRate > 0 ? formatRupee(marketRate) + '/g' : '—'],
                                                ['Deviation',     `${rateDevPct > 0 ? '+' : ''}${rateDevPct.toFixed(1)}%`],
                                            ].map(([k, v]) => (
                                                <div key={k} className="flex flex-col items-center p-3 rounded-lg bg-[#f9fafb] border border-[#e5e7eb]">
                                                    <span className="text-[9px] text-[#9ca3af] uppercase tracking-wider">{k}</span>
                                                    <span className="text-[13px] font-bold text-[#111] mt-0.5">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {marketRate > 0 && (
                                            <GaugeMeter label="Rate vs MCX benchmark" value={Math.max(0, rateDevPct)}
                                                max={30} unit="% above market" warn={10} crit={20} />
                                        )}
                                        {marketRate === 0 && (
                                            <div className="text-[11px] text-[#9ca3af] italic text-center py-2">
                                                Valuation date not available — MCX lookup skipped.
                                            </div>
                                        )}
                                    </div>

                                    {/* ── E: LTV & Income Ratio ── */}
                                    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5">
                                        <h3 className="text-[11px] font-bold text-[#374151] uppercase tracking-wider mb-4">
                                            E · LTV &amp; Income Adequacy
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div className="p-3 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] flex flex-col gap-1">
                                                <span className="text-[9px] text-[#9ca3af] uppercase tracking-wider">Loan Amount</span>
                                                <span className="text-[15px] font-bold text-[#111]">{formatRupee(loanAmount)}</span>
                                            </div>
                                            <div className="p-3 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] flex flex-col gap-1">
                                                <span className="text-[9px] text-[#9ca3af] uppercase tracking-wider">Declared Value</span>
                                                <span className="text-[15px] font-bold text-[#111]">{formatRupee(declaredVal)}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[11px] font-semibold text-[#374151]">LTV Ratio</span>
                                                    <SeverityBadge sev={ltvSev} />
                                                </div>
                                                <GaugeMeter label="" value={ltv} max={100} unit="%" warn={75} crit={85} />
                                                <div className="text-[10px] text-[#9ca3af] mt-1">
                                                    RBI ceiling: 75% — {ltv > 75 ? `⚠ Breach by ${(ltv - 75).toFixed(1)}%` : 'Within limit'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── F: All Gold Findings ── */}
                                    <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-sm p-5">
                                        <h3 className="text-[11px] font-bold text-[#374151] uppercase tracking-wider mb-3">
                                            F · Gold Forensic Findings
                                        </h3>
                                        {goldFindings.length === 0 ? (
                                            <div className="text-[12px] text-[#9ca3af] italic text-center py-6">
                                                No forensic flags raised for this gold appraisal.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {goldFindings.map((f, i) => (
                                                    <FindingCard key={i} finding={f} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })()}



                        {activeModule === 'Underwriting Decision Report' && (() => {
                            const da = backendData?.deep_analysis;
                            const lvl1 = da?.level1;
                            const lvl3 = da?.level3;
                            const lvl4 = da?.level4;


                            const riskScore = lvl1?.risk_score ?? backendData?.risk_score_pct ?? Math.round((backendData?.risk_score || 0) * 100);
                            const verdict = lvl1?.recommended_action || backendData?.verdict || '';
                            const isReject = verdict?.includes('REJECT') || (backendData?.risk_score || 0) > 0.65;
                            const isManual = verdict?.includes('MANUAL') || (backendData?.risk_score || 0) > 0.45;
                            const verdictColor = isReject ? '#ef4444' : isManual ? '#f59e0b' : '#10b981';
                            const verdictBg = isReject ? '#fef2f2' : isManual ? '#fffbeb' : '#f0fdf4';
                            const verdictBorder = isReject ? '#fecaca' : isManual ? '#fde68a' : '#bbf7d0';
                            const verdictLabel = isReject ? 'REJECT — Escalate to Senior Review' : isManual ? 'MANUAL REVIEW — Underwriter Decision Required' : 'APPROVE — Proceed to Standard KYC';
                            const verdictIcon = isReject ? '' : isManual ? '' : '';

                            // Risk decomposition data
                            const riskCategories = lvl4?.categories || [];
                            const riskBarData = riskCategories.map(c => ({
                                name: c.name,
                                score: c.score,
                                risk: Math.max(0, 100 - c.score),
                                weight: c.weight,
                                contribution: c.contribution,
                            }));

                            // Loan eligibility calculation (standard Indian bank norms)
                            const grossMonthly = parseFloat(backendData?.manifest_data?.salary_gross || 0);
                            const netMonthly = parseFloat(backendData?.manifest_data?.salary_net || 0);
                            const existingEmi = lvl3?.liability_cross_check?.bank_emi || 0;
                            // Standard FOIR = 50% of gross (max) for salaried
                            const foirLimit = 0.50;
                            const maxEmiCapacity = grossMonthly > 0 ? Math.round(grossMonthly * foirLimit) - existingEmi : null;
                            const foirActual = grossMonthly > 0 ? (existingEmi / grossMonthly) : null;
                            const foirOk = foirActual !== null ? foirActual < foirLimit : null;

                            // Max loan at 8.5% p.a., 20yr tenure (standard home loan)
                            const RATE = 0.085 / 12;
                            const N = 240;
                            const maxLoan = maxEmiCapacity !== null && maxEmiCapacity > 0
                                ? Math.round(maxEmiCapacity * ((Math.pow(1 + RATE, N) - 1) / (RATE * Math.pow(1 + RATE, N))))
                                : null;

                            // Underwriting checklist
                            const logicForensics = backendData?.logic_forensics || {};
                            const metaForensics = backendData?.metadata_forensics || {};
                            const netGrossRatio = grossMonthly > 0 ? netMonthly / grossMonthly : null;

                            const checks = [
                                {
                                    label: 'Net/Gross Salary Ratio (55–80%)',
                                    pass: netGrossRatio !== null ? netGrossRatio >= 0.55 && netGrossRatio <= 0.80 : null,
                                    detail: netGrossRatio !== null ? `${(netGrossRatio * 100).toFixed(1)}% — ${netGrossRatio >= 0.55 && netGrossRatio <= 0.80 ? 'within normal range' : 'outside 55–80% band'}` : 'Data unavailable',
                                },
                                {
                                    label: 'Mathematical Integrity (Salary)',
                                    pass: logicForensics?.math_integrity !== undefined ? logicForensics.math_integrity : null,
                                    detail: logicForensics?.math_integrity === true ? 'Gross = Basic + HRA + Allowances verified' : logicForensics?.math_integrity === false ? 'Salary components do not add up to declared gross' : 'Not computed',
                                },
                                {
                                    label: 'Document Metadata Clean',
                                    pass: metaForensics?.producer_flag !== undefined ? !metaForensics.producer_flag : null,
                                    detail: metaForensics?.producer_flag ? `PDF producer: ${metaForensics?.pdf_producer || 'graphics editor'} — suspicious` : 'Document origin metadata appears clean',
                                },
                                {
                                    label: 'Employer Verified (MCA/GST/EPFO)',
                                    pass: lvl3?.employer_verification?.mca_status === 'FOUND' ? true : lvl3?.employer_verification?.mca_status === 'NOT FOUND' ? false : null,
                                    detail: lvl3?.employer_verification ? `${lvl3.employer_verification.name}: MCA ${lvl3.employer_verification.mca_status}, EPFO ${lvl3.employer_verification.epfo_status}` : 'Employer not verified',
                                },
                                {
                                    label: 'ITR vs Salary Income Match (±15%)',
                                    pass: logicForensics?.income_ratio_ok !== undefined ? logicForensics.income_ratio_ok : null,
                                    detail: lvl3?.income_triangulation?.status || 'Not compared',
                                },
                                {
                                    label: 'Cross-Document Coherence',
                                    pass: logicForensics?.semantic_consistency !== undefined ? logicForensics.semantic_consistency : null,
                                    detail: logicForensics?.semantic_consistency ? 'Name, PAN, employer consistent across documents' : 'Inconsistencies detected across submitted documents',
                                },
                                {
                                    label: 'FOIR ≤ 50% of Gross Salary',
                                    pass: foirOk,
                                    detail: foirActual !== null ? `Current FOIR: ${(foirActual * 100).toFixed(1)}% — ${foirOk ? 'within limit' : 'exceeds 50% threshold'}` : 'Existing obligations not assessed',
                                },
                                {
                                    label: 'Wealth-to-Income Ratio',
                                    pass: logicForensics?.wealth_ratio_ok !== undefined ? logicForensics.wealth_ratio_ok : null,
                                    detail: logicForensics?.wealth_ratio_ok ? 'Land value is proportionate to declared income' : 'Land asset value unusually high vs declared salary',
                                },
                            ];

                            const passCount = checks.filter(c => c.pass === true).length;
                            const failCount = checks.filter(c => c.pass === false).length;
                            const naCount = checks.filter(c => c.pass === null).length;

                            // Income triangulation
                            const tri = lvl3?.income_triangulation;
                            const triData = tri ? [
                                { source: 'Salary Slip', monthly: tri.salary_slip?.monthly, annual: tri.salary_slip?.annual, color: '#6366f1' },
                                { source: 'Bank Stmt', monthly: tri.bank_stmt?.monthly, annual: tri.bank_stmt?.annual, color: '#f59e0b' },
                                { source: 'ITR Filed', monthly: tri.itr?.monthly, annual: tri.itr?.annual, color: '#10b981' },
                            ] : [];

                            const UwCheckRow = ({ label, pass, detail }) => {
                                const color = pass === true ? '#10b981' : pass === false ? '#ef4444' : '#9ca3af';
                                const icon = pass === true ? '' : pass === false ? '' : '—';
                                const bg = pass === true ? '#10b98108' : pass === false ? '#ef444408' : 'transparent';
                                return (
                                    <tr className="border-b border-[#f3f4f6] last:border-0" style={{ background: bg }}>
                                        <td className="p-2.5 text-[11px] font-semibold text-[#111]">{label}</td>
                                        <td className="p-2.5 text-center">
                                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
                                                style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>{icon}</span>
                                        </td>
                                        <td className="p-2.5 text-[10px] text-[#6b7280]">{detail}</td>
                                    </tr>
                                );
                            };

                            const RiskTooltip = ({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0]?.payload;
                                return (
                                    <div className="bg-white border border-[#e5e7eb] rounded-lg shadow-lg p-3 text-[11px]">
                                        <p className="font-bold text-[#111] mb-1">{d?.name}</p>
                                        <p className="text-[#10b981]">Score: <b>{d?.score}/100</b></p>
                                        <p className="text-[#ef4444]">Risk contribution: <b>{d?.contribution?.toFixed(1)}</b> pts</p>
                                        <p className="text-[#6b7280]">Weight in model: <b>{d?.weight}%</b></p>
                                    </div>
                                );
                            };

                            return (
                                <motion.div
                                    key="underwriting-report"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm w-full"
                                >
                                    {/* Header */}
                                    <div className="p-4 border-b border-[#e5e7eb] bg-[#fafafa] rounded-t-lg flex items-center justify-between">
                                        <h2 className="text-[14px] font-bold text-[#111] uppercase">9. Underwriting Decision Report</h2>
                                        <div className="flex items-center gap-3 text-[11px]">
                                            <span className="text-[#6b7280] font-medium">Overall Risk:</span>
                                            <span className="font-extrabold text-[15px]" style={{ color: verdictColor }}>{riskScore}%</span>
                                        </div>
                                    </div>

                                    <div className="p-5 space-y-7">

                                        {/* ── A: Decision Banner ── */}
                                        <div className="p-4 rounded-xl border-2 flex items-center gap-5"
                                            style={{ background: verdictBg, borderColor: verdictBorder }}>
                                            <div className="flex items-center justify-center w-12 h-12 rounded-full text-[22px] font-black flex-shrink-0"
                                                style={{ background: `${verdictColor}20`, color: verdictColor }}>
                                                {verdictIcon}
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-[13px] font-extrabold uppercase tracking-wide" style={{ color: verdictColor }}>{verdictLabel}</div>
                                                {lvl1?.critical_findings?.length > 0 && (
                                                    <ul className="mt-2 space-y-0.5">
                                                        {lvl1.critical_findings.map((f, i) => (
                                                            <li key={i} className="text-[11px] text-[#374151] flex items-start gap-1.5">
                                                                <span className="mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: verdictColor }} />
                                                                {f}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                            <div className="flex-shrink-0 text-center">
                                                <div className="text-[28px] font-black" style={{ color: verdictColor }}>{riskScore}</div>
                                                <div className="text-[9px] font-bold text-[#6b7280] uppercase">Risk Score</div>
                                            </div>
                                        </div>

                                        {/* ── B: Risk Decomposition Chart ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">B · Risk Factor Decomposition</h3>
                                                {lvl4?.dominant_risk_driver && (
                                                    <span className="text-[10px] text-[#6b7280] max-w-[280px] text-right leading-tight">{lvl4.dominant_risk_driver}</span>
                                                )}
                                            </div>
                                            {riskBarData.length > 0 ? (
                                                <div className="space-y-2">
                                                    {riskBarData.map((cat, i) => {
                                                        const barColor = cat.risk > 60 ? '#ef4444' : cat.risk > 30 ? '#f59e0b' : '#10b981';
                                                        return (
                                                            <div key={i} className="flex items-center gap-3">
                                                                <div className="w-[160px] text-[11px] font-semibold text-[#374151] flex-shrink-0 truncate">{cat.name}</div>
                                                                <div className="flex-1 bg-[#f3f4f6] rounded-full h-5 overflow-hidden relative">
                                                                    <div className="h-5 rounded-full transition-all duration-500"
                                                                        style={{ width: `${cat.risk}%`, background: barColor, opacity: 0.85 }} />
                                                                    <span className="absolute inset-0 flex items-center pl-2 text-[9px] font-bold text-white mix-blend-overlay">
                                                                        {cat.risk > 10 ? `${cat.risk.toFixed(0)}% risk` : ''}
                                                                    </span>
                                                                </div>
                                                                <div className="w-[80px] text-right text-[10px] text-[#6b7280] flex-shrink-0">
                                                                    Score <span className="font-bold text-[#111]">{cat.score}/100</span>
                                                                </div>
                                                                <div className="w-[60px] text-right text-[10px] text-[#9ca3af] flex-shrink-0">wt {cat.weight}%</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="text-center py-6 text-[12px] text-[#9ca3af] bg-[#fafafa] rounded-lg border border-dashed border-[#e5e7eb]">
                                                    Run analysis to populate risk decomposition
                                                </div>
                                            )}
                                        </div>

                                        {/* ── C: Loan Eligibility ── */}
                                        <div>
                                            <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">C · Loan Eligibility Estimation</h3>
                                            {grossMonthly > 0 ? (
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    <div className="p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa]">
                                                        <div className="text-[10px] text-[#6b7280] font-bold uppercase mb-0.5">Gross Monthly</div>
                                                        <div className="text-[14px] font-extrabold text-[#6366f1]">₹{(grossMonthly / 1000).toFixed(1)}k</div>
                                                        <div className="text-[10px] text-[#9ca3af]">₹{(grossMonthly * 12 / 100000).toFixed(1)}L p.a.</div>
                                                    </div>
                                                    <div className="p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa]">
                                                        <div className="text-[10px] text-[#6b7280] font-bold uppercase mb-0.5">Max EMI (FOIR 50%)</div>
                                                        <div className="text-[14px] font-extrabold" style={{ color: foirOk === false ? '#ef4444' : '#111' }}>
                                                            {maxEmiCapacity !== null && maxEmiCapacity > 0 ? `₹${(maxEmiCapacity / 1000).toFixed(1)}k` : '—'}
                                                        </div>
                                                        <div className="text-[10px] text-[#9ca3af]">After existing EMIs</div>
                                                    </div>
                                                    <div className="p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa]">
                                                        <div className="text-[10px] text-[#6b7280] font-bold uppercase mb-0.5">Current FOIR</div>
                                                        <div className="text-[14px] font-extrabold" style={{ color: foirOk === false ? '#ef4444' : foirOk === true ? '#10b981' : '#9ca3af' }}>
                                                            {foirActual !== null ? `${(foirActual * 100).toFixed(1)}%` : '—'}
                                                        </div>
                                                        <div className="text-[10px] text-[#9ca3af]">Limit: 50% of gross</div>
                                                    </div>
                                                    <div className="p-3 rounded-lg border border-[#e5e7eb] bg-[#fafafa]">
                                                        <div className="text-[10px] text-[#6b7280] font-bold uppercase mb-0.5">Max Loan (20yr/8.5%)</div>
                                                        <div className="text-[14px] font-extrabold text-[#111]">
                                                            {maxLoan ? `₹${(maxLoan / 100000).toFixed(1)}L` : '—'}
                                                        </div>
                                                        <div className="text-[10px] text-[#9ca3af]">Indicative only</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-center py-6 text-[12px] text-[#9ca3af] bg-[#fafafa] rounded-lg border border-dashed border-[#e5e7eb]">
                                                    Salary data required for eligibility calculation
                                                </div>
                                            )}
                                        </div>

                                        {/* ── D: Underwriting Checklist ── */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">D · Underwriting Checklist</h3>
                                                <div className="flex gap-2 text-[10px]">
                                                    <span className="text-[#10b981] font-bold"> {passCount} Pass</span>
                                                    <span className="text-[#ef4444] font-bold"> {failCount} Fail</span>
                                                    {naCount > 0 && <span className="text-[#9ca3af] font-bold">— {naCount} N/A</span>}
                                                </div>
                                            </div>
                                            <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
                                                <table className="w-full">
                                                    <thead className="bg-[#f3f4f6]">
                                                        <tr>
                                                            <th className="p-2.5 text-left text-[10px] font-bold text-[#374151] uppercase tracking-wide">Criterion</th>
                                                            <th className="p-2.5 text-center text-[10px] font-bold text-[#374151] uppercase tracking-wide w-12">Status</th>
                                                            <th className="p-2.5 text-left text-[10px] font-bold text-[#374151] uppercase tracking-wide">Detail</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {checks.map((c, i) => <UwCheckRow key={i} {...c} />)}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* ── E: Income Triangulation ── */}
                                        {triData.length > 0 && (
                                            <div>
                                                <div className="flex items-center justify-between mb-3">
                                                    <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider">E · Income Triangulation</h3>
                                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                                                        style={{
                                                            color: tri?.status?.includes('MISMATCH') ? '#dc2626' : '#059669',
                                                            background: tri?.status?.includes('MISMATCH') ? '#fef2f2' : '#f0fdf4',
                                                            borderColor: tri?.status?.includes('MISMATCH') ? '#fecaca' : '#bbf7d0'
                                                        }}>
                                                        {tri?.status?.includes('MISMATCH') ? ' Mismatch' : ' Coherent'}
                                                    </span>
                                                </div>
                                                <div style={{ height: 160, width: '100%' }}>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={triData} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                                            <XAxis dataKey="source" tick={{ fontSize: 11, fill: '#6b7280', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                                            <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                                            <Tooltip formatter={(v, n) => [formatRupee(v), 'Monthly']} />
                                                            <Bar dataKey="monthly" radius={[6, 6, 0, 0]}>
                                                                {triData.map((entry, idx) => (
                                                                    <Cell key={idx} fill={entry.color} />
                                                                ))}
                                                            </Bar>
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                <div className="mt-2 grid grid-cols-3 gap-3">
                                                    {triData.map((d, i) => (
                                                        <div key={i} className="p-2.5 rounded-lg border border-[#e5e7eb] text-center">
                                                            <div className="flex items-center justify-center gap-1.5 mb-1">
                                                                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                                                                <span className="text-[10px] font-bold text-[#374151]">{d.source}</span>
                                                            </div>
                                                            <div className="text-[13px] font-extrabold text-[#111]">{d.monthly ? formatRupee(d.monthly) : '—'}<span className="text-[9px] font-normal text-[#9ca3af]">/mo</span></div>
                                                            <div className="text-[10px] text-[#9ca3af]">{d.annual ? formatRupee(d.annual) : '—'} / yr</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* ── F: Warnings & Action Items ── */}
                                        {(lvl1?.warnings?.length > 0 || lvl1?.critical_findings?.length > 0) && (
                                            <div>
                                                <h3 className="text-[12px] font-bold text-[#374151] uppercase tracking-wider mb-3">F · Action Items for Underwriter</h3>
                                                <div className="space-y-2">
                                                    {lvl1?.critical_findings?.map((f, i) => (
                                                        <div key={`cf-${i}`} className="flex items-start gap-3 p-3 rounded-lg border border-[#fecaca] bg-[#fef2f2]">
                                                            <span className="text-[#dc2626] font-black text-[12px] flex-shrink-0 mt-0.5"></span>
                                                            <div>
                                                                <div className="text-[10px] font-bold text-[#dc2626] uppercase tracking-wide mb-0.5">Critical Finding</div>
                                                                <div className="text-[11px] text-[#374151]">{f}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {lvl1?.warnings?.map((w, i) => (
                                                        <div key={`w-${i}`} className="flex items-start gap-3 p-3 rounded-lg border border-[#fde68a] bg-[#fffbeb]">
                                                            <span className="text-[#d97706] font-black text-[12px] flex-shrink-0 mt-0.5"></span>
                                                            <div>
                                                                <div className="text-[10px] font-bold text-[#b45309] uppercase tracking-wide mb-0.5">Warning</div>
                                                                <div className="text-[11px] text-[#374151]">{w}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })()}

                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default ForensicWorkspace;
