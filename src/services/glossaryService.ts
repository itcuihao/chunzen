import * as vscode from 'vscode';
import * as fs from 'fs';
import { GlossaryEntry } from '../types/models';

const GLOSSARY_KEY = 'chunzen.glossary';
const MAX_TERMS = 1500;

/**
 * 术语表服务 — CRUD，持久化到 extension globalState，增加分类、预置与批量导入支持
 */
export class GlossaryService {
  constructor(private context: vscode.ExtensionContext) {}

  getAll(): GlossaryEntry[] {
    let terms = this.context.globalState.get<GlossaryEntry[]>(GLOSSARY_KEY);
    if (terms === undefined) {
      terms = this.getDefaultTerms();
      this.save(terms);
    }
    return terms;
  }

  add(source: string, target: string, category?: string): GlossaryEntry {
    const terms = this.getAll();
    if (terms.length >= MAX_TERMS) {
      throw new Error(`术语表已达上限 (${MAX_TERMS} 条)`);
    }
    const entry: GlossaryEntry = {
      id: generateId(),
      source: source.trim(),
      target: target.trim(),
      category: category ? category.trim() : '其他'
    };
    terms.push(entry);
    this.save(terms);
    return entry;
  }

  update(id: string, source: string, target: string, category?: string): GlossaryEntry | undefined {
    const terms = this.getAll();
    const idx = terms.findIndex(t => t.id === id);
    if (idx === -1) return undefined;
    terms[idx] = { 
      id, 
      source: source.trim(), 
      target: target.trim(),
      category: category ? category.trim() : (terms[idx].category || '其他')
    };
    this.save(terms);
    return terms[idx];
  }

  delete(id: string): boolean {
    const terms = this.getAll();
    const idx = terms.findIndex(t => t.id === id);
    if (idx === -1) return false;
    terms.splice(idx, 1);
    this.save(terms);
    return true;
  }

  clear(): void {
    this.context.globalState.update(GLOSSARY_KEY, []);
  }

  restoreDefaults(): void {
    const defaults = this.getDefaultTerms();
    this.save(defaults);
  }

  /**
   * Import terms from CSV, TSV, TXT, or JSON file.
   */
  async importFromFile(filePath: string, defaultCategory?: string): Promise<number> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    let importedCount = 0;
    const terms = this.getAll();

    // Try parsing as JSON first
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && item.source && item.target) {
            const src = String(item.source).trim();
            const tgt = String(item.target).trim();
            const cat = item.category ? String(item.category).trim() : (defaultCategory || '其他');
            if (src && tgt && !terms.some(t => t.source.toLowerCase() === src.toLowerCase())) {
              terms.push({
                id: generateId(),
                source: src,
                target: tgt,
                category: cat
              });
              importedCount++;
            }
          }
        }
        this.save(terms);
        return importedCount;
      }
    } catch {
      // Continue parsing as text file
    }

    // Split text by lines
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Split by comma, tab, or vertical bar
      const parts = trimmed.split(/,|\t|\|/);
      if (parts.length < 2) continue;

      const src = parts[0].trim();
      const tgt = parts[1].trim();
      const cat = parts.length >= 3 && parts[2].trim() ? parts[2].trim() : (defaultCategory || '其他');

      if (src && tgt && !terms.some(t => t.source.toLowerCase() === src.toLowerCase())) {
        terms.push({
          id: generateId(),
          source: src,
          target: tgt,
          category: cat
        });
        importedCount++;
      }
    }

    this.save(terms);
    return importedCount;
  }

  /**
   * High performance scan to find glossary entries present in a text
   */
  getMatchingTerms(text: string): GlossaryEntry[] {
    const terms = this.getAll();
    const matched: GlossaryEntry[] = [];
    const lowerText = text.toLowerCase();

    for (const term of terms) {
      const sources = term.source.split('|').map(s => s.trim());
      let hasMatch = false;

      for (const s of sources) {
        if (!s) continue;
        const isEnglish = /^[a-zA-Z\s\-_]+$/.test(s);
        if (isEnglish) {
          const escS = s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const reg = new RegExp(`\\b${escS}\\b`, 'i');
          if (reg.test(text)) {
            hasMatch = true;
            break;
          }
        } else {
          if (lowerText.includes(s.toLowerCase())) {
            hasMatch = true;
            break;
          }
        }
      }

      if (hasMatch) {
        matched.push(term);
      }
    }
    return matched;
  }

  applyToText(text: string): Array<{ source: string; target: string }> {
    const matched = this.getMatchingTerms(text);
    return matched.map(m => ({ source: m.source, target: m.target }));
  }

  private save(terms: GlossaryEntry[]): void {
    this.context.globalState.update(GLOSSARY_KEY, terms);
  }

  private getDefaultTerms(): GlossaryEntry[] {
    const defaultData = [
      // 计算机与人工智能
      { source: 'Attention', target: '注意力', category: '计算机与人工智能' },
      { source: 'Self-Attention', target: '自注意力', category: '计算机与人工智能' },
      { source: 'Transformer', target: 'Transformer', category: '计算机与人工智能' },
      { source: 'Zero-shot', target: '零样本', category: '计算机与人工智能' },
      { source: 'Few-shot', target: '少样本', category: '计算机与人工智能' },
      { source: 'One-shot', target: '单样本', category: '计算机与人工智能' },
      { source: 'Fine-tuning', target: '微调', category: '计算机与人工智能' },
      { source: 'Embedding', target: '嵌入', category: '计算机与人工智能' },
      { source: 'Feature Extraction', target: '特征提取', category: '计算机与人工智能' },
      { source: 'Loss Function', target: '损失函数', category: '计算机与人工智能' },
      { source: 'Inference', target: '推理', category: '计算机与人工智能' },
      { source: 'Overfitting', target: '过拟合', category: '计算机与人工智能' },
      { source: 'Underfitting', target: '欠拟合', category: '计算机与人工智能' },
      { source: 'Supervised Learning', target: '监督学习', category: '计算机与人工智能' },
      { source: 'Unsupervised Learning', target: '无监督学习', category: '计算机与人工智能' },
      { source: 'Reinforcement Learning', target: '强化学习', category: '计算机与人工智能' },
      { source: 'Large Language Model', target: '大语言模型', category: '计算机与人工智能' },
      { source: 'Prompt', target: '提示词', category: '计算机与人工智能' },
      { source: 'Tokenizer', target: '分词器', category: '计算机与人工智能' },
      { source: 'Neural Network', target: '神经网络', category: '计算机与人工智能' },

      // 生物医学
      { source: 'PCR', target: '聚合酶链式反应', category: '生物医学' },
      { source: 'DNA', target: '脱氧核糖核酸', category: '生物医学' },
      { source: 'RNA', target: '核糖核酸', category: '生物医学' },
      { source: 'Genome', target: '基因组', category: '生物医学' },
      { source: 'Apoptosis', target: '细胞凋亡', category: '生物医学' },
      { source: 'Pathogen', target: '病原体', category: '生物医学' },
      { source: 'Metabolism', target: '代谢', category: '生物医学' },
      { source: 'Signal Transduction', target: '信号转导', category: '生物医学' },
      { source: 'Transcription Factor', target: '转录因子', category: '生物医学' },

      // 化学
      { source: 'Chirality', target: '手性', category: '化学' },
      { source: 'Activation Energy', target: '活化能', category: '化学' },
      { source: 'Catalyst', target: '催化剂', category: '化学' },
      { source: 'Synthesis', target: '合成', category: '化学' },
      { source: 'Covalent Bond', target: '共价键', category: '化学' },
      { source: 'Isomer', target: '同分异构体', category: '化学' },
      { source: 'Solvent', target: '溶剂', category: '化学' },
      { source: 'Electrolysis', target: '电解', category: '化学' },
      { source: 'Reagent', target: '化学试剂', category: '化学' },
      { source: 'Titration', target: '滴定', category: '化学' },

      // 物理学
      { source: 'Entropy', target: '熵', category: '物理学' },
      { source: 'Quantum Entanglement', target: '量子纠缠', category: '物理学' },
      { source: 'Superconductivity', target: '超导', category: '物理学' },
      { source: 'Relativity', target: '相对论', category: '物理学' },
      { source: 'Thermodynamics', target: '热力学', category: '物理学' },
      { source: 'Electromagnetism', target: '电磁学', category: '物理学' },
      { source: 'Black Hole', target: '黑洞', category: '物理学' },
      { source: 'Dark Matter', target: '暗物质', category: '物理学' },
      { source: 'Semiconductor', target: '半导体', category: '物理学' },
      { source: 'Laser', target: '激光', category: '物理学' },

      // 通用学术
      { source: 'State-of-the-art', target: '最先进的 (SOTA)', category: '通用学术' },
      { source: 'Ablation Study', target: '消融实验', category: '通用学术' },
      { source: 'Pipeline', target: '流水线', category: '通用学术' },
      { source: 'Novel', target: '新颖的 / 创新的', category: '通用学术' },
      { source: 'Mechanism', target: '机制', category: '通用学术' },
      { source: 'Robust', target: '鲁棒的 / 稳健的', category: '通用学术' },
      { source: 'Framework', target: '框架', category: '通用学术' },
      { source: 'Validation', target: '验证', category: '通用学术' },
      { source: 'Ground Truth', target: '真实标签 (Ground Truth)', category: '通用学术' },
      { source: 'Methodology', target: '方法论', category: '通用学术' }
    ];

    return defaultData.map((d, idx) => ({
      id: `default-${idx}`,
      source: d.source,
      target: d.target,
      category: d.category
    }));
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}