// ============================================================
//  CURNX v1.1 — engine/parser.js
//  Tokenizer + Recursive-Descent Parser (AST generator)
//  Converts raw C source into tokens, then into an AST.
//  Loaded by engine/curnx.js — exposes: tokenize(), parse(), TT
// ============================================================

// ── Part 1: Lexer / Tokenizer ──────────────────────────────

const TT = {
  INT:'INT', FLOAT_KW:'FLOAT_KW', CHAR_KW:'CHAR_KW', DOUBLE:'DOUBLE',
  VOID:'VOID', RETURN:'RETURN', IF:'IF', ELSE:'ELSE', WHILE:'WHILE',
  FOR:'FOR', DO:'DO', BREAK:'BREAK', CONTINUE:'CONTINUE', SWITCH:'SWITCH',
  CASE:'CASE', DEFAULT:'DEFAULT', STRUCT:'STRUCT', TYPEDEF:'TYPEDEF',
  SIZEOF:'SIZEOF', NULL_KW:'NULL_KW', INCLUDE:'INCLUDE', DEFINE:'DEFINE',
  NUM:'NUM', FNUM:'FNUM', STR:'STR', CHAR:'CHAR', ID:'ID',
  PLUS:'PLUS', MINUS:'MINUS', STAR:'STAR', SLASH:'SLASH', PERCENT:'PERCENT',
  EQ:'EQ', NEQ:'NEQ', LT:'LT', GT:'GT', LTE:'LTE', GTE:'GTE',
  AND:'AND', OR:'OR', NOT:'NOT',
  AMP:'AMP', PIPE:'PIPE', CARET:'CARET', TILDE:'TILDE', LSHIFT:'LSHIFT', RSHIFT:'RSHIFT',
  ASSIGN:'ASSIGN', PLUS_ASSIGN:'PLUS_ASSIGN', MINUS_ASSIGN:'MINUS_ASSIGN',
  MUL_ASSIGN:'MUL_ASSIGN', DIV_ASSIGN:'DIV_ASSIGN', MOD_ASSIGN:'MOD_ASSIGN',
  INC:'INC', DEC:'DEC',
  LPAREN:'LPAREN', RPAREN:'RPAREN', LBRACE:'LBRACE', RBRACE:'RBRACE',
  LBRACKET:'LBRACKET', RBRACKET:'RBRACKET',
  SEMI:'SEMI', COMMA:'COMMA', DOT:'DOT', ARROW:'ARROW', COLON:'COLON',
  QUESTION:'QUESTION', ELLIPSIS:'ELLIPSIS',
  EOF:'EOF'
};

const KEYWORDS = {
  int:TT.INT, float:TT.FLOAT_KW, char:TT.CHAR_KW, double:TT.DOUBLE,
  void:TT.VOID, return:TT.RETURN, if:TT.IF, else:TT.ELSE, while:TT.WHILE,
  for:TT.FOR, do:TT.DO, break:TT.BREAK, continue:TT.CONTINUE,
  switch:TT.SWITCH, case:TT.CASE, default:TT.DEFAULT,
  struct:TT.STRUCT, typedef:TT.TYPEDEF, sizeof:TT.SIZEOF,
  NULL:TT.NULL_KW, long:TT.INT, short:TT.INT, unsigned:TT.INT, signed:TT.INT,
  const:TT.INT,
};

function unescape_c(c) {
  return { n:'\n', t:'\t', r:'\r', '\\':'\\', '"':'"', "'":"'", '0':'\0', a:'\x07', b:'\x08' }[c] || c;
}

function tokenize(src) {
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    // Whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // Line comment
    if (src[i] === '/' && src[i+1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }

    // Block comment
    if (src[i] === '/' && src[i+1] === '*') {
      i += 2;
      while (i < src.length && !(src[i-1] === '*' && src[i] === '/')) i++;
      i++;
      continue;
    }

    // Preprocessor directives (#include, #define, etc.)
    if (src[i] === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }

    // String literal
    if (src[i] === '"') {
      let s = ''; i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') { i++; s += unescape_c(src[i]); }
        else s += src[i];
        i++;
      }
      i++;
      tokens.push({ type: TT.STR, val: s });
      continue;
    }

    // Char literal
    if (src[i] === "'") {
      i++;
      let c;
      if (src[i] === '\\') { i++; c = unescape_c(src[i]); } else c = src[i];
      i++;
      if (src[i] === "'") i++;
      tokens.push({ type: TT.CHAR, val: c });
      continue;
    }

    // Number literal
    if (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i+1]))) {
      let s = '';
      while (i < src.length && /[0-9]/.test(src[i])) s += src[i++];
      if (i < src.length && src[i] === '.' && /[0-9]/.test(src[i+1])) {
        s += src[i++];
        while (i < src.length && /[0-9]/.test(src[i])) s += src[i++];
        if (i < src.length && (src[i] === 'f' || src[i] === 'F')) i++;
        tokens.push({ type: TT.FNUM, val: parseFloat(s) });
      } else {
        if (i < src.length && /[LuUl]/.test(src[i])) i++;
        tokens.push({ type: TT.NUM, val: parseInt(s, 10) });
      }
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(src[i])) {
      let s = '';
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) s += src[i++];
      const kw = KEYWORDS[s];
      tokens.push(kw ? { type: kw, val: s } : { type: TT.ID, val: s });
      continue;
    }

    // Multi-character operators
    const two = src.slice(i, i+2);
    const three = src.slice(i, i+3);

    if (three === '...') { tokens.push({ type: TT.ELLIPSIS }); i += 3; continue; }
    if (two === '==')    { tokens.push({ type: TT.EQ });         i += 2; continue; }
    if (two === '!=')    { tokens.push({ type: TT.NEQ });        i += 2; continue; }
    if (two === '<=')    { tokens.push({ type: TT.LTE });        i += 2; continue; }
    if (two === '>=')    { tokens.push({ type: TT.GTE });        i += 2; continue; }
    if (two === '&&')    { tokens.push({ type: TT.AND });        i += 2; continue; }
    if (two === '||')    { tokens.push({ type: TT.OR });         i += 2; continue; }
    if (two === '++')    { tokens.push({ type: TT.INC });        i += 2; continue; }
    if (two === '--')    { tokens.push({ type: TT.DEC });        i += 2; continue; }
    if (two === '+=')    { tokens.push({ type: TT.PLUS_ASSIGN }); i += 2; continue; }
    if (two === '-=')    { tokens.push({ type: TT.MINUS_ASSIGN }); i += 2; continue; }
    if (two === '*=')    { tokens.push({ type: TT.MUL_ASSIGN }); i += 2; continue; }
    if (two === '/=')    { tokens.push({ type: TT.DIV_ASSIGN }); i += 2; continue; }
    if (two === '%=')    { tokens.push({ type: TT.MOD_ASSIGN }); i += 2; continue; }
    if (two === '->')    { tokens.push({ type: TT.ARROW });      i += 2; continue; }
    if (two === '<<')    { tokens.push({ type: TT.LSHIFT });     i += 2; continue; }
    if (two === '>>')    { tokens.push({ type: TT.RSHIFT });     i += 2; continue; }

    // Single character operators
    const single = {
      '+': TT.PLUS,  '-': TT.MINUS, '*': TT.STAR,  '/': TT.SLASH, '%': TT.PERCENT,
      '<': TT.LT,    '>': TT.GT,    '!': TT.NOT,   '=': TT.ASSIGN,
      '(': TT.LPAREN, ')': TT.RPAREN, '{': TT.LBRACE, '}': TT.RBRACE,
      '[': TT.LBRACKET, ']': TT.RBRACKET,
      ';': TT.SEMI,  ',': TT.COMMA, '.': TT.DOT,
      '&': TT.AMP,   '|': TT.PIPE,  '^': TT.CARET, '~': TT.TILDE,
      ':': TT.COLON, '?': TT.QUESTION
    };

    if (single[src[i]]) { tokens.push({ type: single[src[i]] }); i++; continue; }

    i++; // skip unknown character
  }

  tokens.push({ type: TT.EOF });
  return tokens;
}

// ── Part 2: Recursive-Descent Parser (AST generator) ────────
// ============================================================
//  CURNX CJs — Parser
//  Converts token stream into an Abstract Syntax Tree (AST)
//  Uses recursive descent parsing
// ============================================================

function parse(tokens) {
  let pos = 0;

  const peek  = ()      => tokens[pos];
  const eat   = (type)  => {
    const t = tokens[pos];
    if (type && t.type !== type)
      throw new Error(`Expected ${type} but got ${t.type} ('${t.val || t.type}')`);
    pos++;
    return t;
  };
  const check = (...types) => types.includes(tokens[pos].type);
  const match = (...types) => { if (check(...types)) return eat(); return null; };

  const isTypeName = () => check(TT.INT, TT.FLOAT_KW, TT.CHAR_KW, TT.DOUBLE, TT.VOID);

  const parseType = () => {
    let t = eat();
    while (isTypeName()) t = eat(); // handle: unsigned long int, etc.
    const base = t.val || t.type;
    let ptr = 0;
    while (check(TT.STAR)) { eat(TT.STAR); ptr++; }
    return { base, ptr };
  };

  // ── TOP LEVEL ──────────────────────────────────────────────

  function parseProgram() {
    const decls = [];
    while (!check(TT.EOF)) {
      if (check(TT.STRUCT))  { decls.push(parseStruct()); continue; }
      if (check(TT.TYPEDEF)) { eat(); parseType(); if (check(TT.ID)) eat(); match(TT.SEMI); continue; }
      const typ  = parseType();
      const name = eat(TT.ID);
      if (check(TT.LPAREN)) decls.push(parseFuncDef(typ, name.val));
      else                  decls.push(parseGlobalVar(typ, name));
    }
    return { type: 'Program', body: decls };
  }

  function parseStruct() {
    eat(TT.STRUCT);
    const name = check(TT.ID) ? eat(TT.ID).val : null;
    eat(TT.LBRACE);
    const fields = [];
    while (!check(TT.RBRACE)) {
      const ft = parseType();
      do {
        const fn = eat(TT.ID);
        let sz = null;
        if (match(TT.LBRACKET)) { sz = parseExpr(); eat(TT.RBRACKET); }
        fields.push({ name: fn.val, type: ft, size: sz });
      } while (match(TT.COMMA));
      eat(TT.SEMI);
    }
    eat(TT.RBRACE);
    match(TT.SEMI);
    return { type: 'StructDef', name, fields };
  }

  function parseGlobalVar(typ, name) {
    const decls2 = [];
    let sz = null, init = null;
    if (match(TT.LBRACKET)) { if (!check(TT.RBRACKET)) sz = parseExpr(); eat(TT.RBRACKET); }
    if (match(TT.ASSIGN)) init = parseAssign();
    decls2.push({ name: name.val, size: sz, init });
    while (match(TT.COMMA)) {
      const n = eat(TT.ID);
      let s2 = null, i2 = null;
      if (match(TT.LBRACKET)) { if (!check(TT.RBRACKET)) s2 = parseExpr(); eat(TT.RBRACKET); }
      if (match(TT.ASSIGN)) i2 = parseAssign();
      decls2.push({ name: n.val, size: s2, init: i2 });
    }
    eat(TT.SEMI);
    return { type: 'VarDecl', varType: typ, decls: decls2, global: true };
  }

  function parseFuncDef(retType, name) {
    eat(TT.LPAREN);
    const params = [];
    if (!check(TT.RPAREN)) {
      if (check(TT.ELLIPSIS)) eat(TT.ELLIPSIS);
      else {
        do {
          if (check(TT.ELLIPSIS)) { eat(TT.ELLIPSIS); break; }
          const pt  = parseType();
          let pn    = '_unnamed';
          if (check(TT.ID)) pn = eat(TT.ID).val;
          let arr   = false;
          if (match(TT.LBRACKET)) { match(TT.RBRACKET); arr = true; }
          params.push({ name: pn, varType: pt, arr });
        } while (match(TT.COMMA));
      }
    }
    eat(TT.RPAREN);
    if (match(TT.SEMI)) return { type: 'FuncDecl', retType, name, params };
    const body = parseBlock();
    return { type: 'FuncDef', retType, name, params, body };
  }

  // ── STATEMENTS ─────────────────────────────────────────────

  function parseBlock() {
    eat(TT.LBRACE);
    const stmts = [];
    while (!check(TT.RBRACE) && !check(TT.EOF)) stmts.push(parseStmt());
    eat(TT.RBRACE);
    return { type: 'Block', body: stmts };
  }

  function parseStmt() {
    if (isTypeName() || check(TT.STRUCT)) return parseVarDeclStmt();
    if (check(TT.LBRACE))   return parseBlock();
    if (check(TT.IF))       return parseIf();
    if (check(TT.WHILE))    return parseWhile();
    if (check(TT.FOR))      return parseFor();
    if (check(TT.DO))       return parseDoWhile();
    if (check(TT.RETURN))   return parseReturn();
    if (check(TT.BREAK))    { eat(); eat(TT.SEMI); return { type: 'Break' }; }
    if (check(TT.CONTINUE)) { eat(); eat(TT.SEMI); return { type: 'Continue' }; }
    if (check(TT.SWITCH))   return parseSwitch();
    const e = parseExpr();
    eat(TT.SEMI);
    return { type: 'ExprStmt', expr: e };
  }

  function parseVarDeclStmt() {
    let typ;
    if (check(TT.STRUCT)) {
      eat(TT.STRUCT);
      const sn  = eat(TT.ID).val;
      let ptr   = 0;
      while (check(TT.STAR)) { eat(); ptr++; }
      typ = { base: 'struct:' + sn, ptr };
    } else {
      typ = parseType();
    }
    const decls2 = [];
    do {
      const name = eat(TT.ID);
      let sz = null, init = null;
      if (match(TT.LBRACKET)) { if (!check(TT.RBRACKET)) sz = parseExpr(); eat(TT.RBRACKET); }
      if (match(TT.ASSIGN)) {
        if (check(TT.LBRACE)) init = parseInitList();
        else init = parseAssign();
      }
      decls2.push({ name: name.val, size: sz, init });
    } while (match(TT.COMMA));
    eat(TT.SEMI);
    return { type: 'VarDecl', varType: typ, decls: decls2 };
  }

  function parseInitList() {
    eat(TT.LBRACE);
    const items = [];
    while (!check(TT.RBRACE)) {
      if (check(TT.LBRACE)) items.push(parseInitList());
      else items.push(parseAssign());
      match(TT.COMMA);
    }
    eat(TT.RBRACE);
    return { type: 'InitList', items };
  }

  function parseIf() {
    eat(TT.IF); eat(TT.LPAREN);
    const cond = parseExpr(); eat(TT.RPAREN);
    const then = parseStmt();
    let els = null;
    if (match(TT.ELSE)) els = parseStmt();
    return { type: 'If', cond, then, els };
  }

  function parseWhile() {
    eat(TT.WHILE); eat(TT.LPAREN);
    const cond = parseExpr(); eat(TT.RPAREN);
    const body = parseStmt();
    return { type: 'While', cond, body };
  }

  function parseDoWhile() {
    eat(TT.DO);
    const body = parseStmt();
    eat(TT.WHILE); eat(TT.LPAREN);
    const cond = parseExpr(); eat(TT.RPAREN); eat(TT.SEMI);
    return { type: 'DoWhile', cond, body };
  }

  function parseFor() {
    eat(TT.FOR); eat(TT.LPAREN);
    let init = null;
    if (!check(TT.SEMI)) {
      if (isTypeName()) init = parseVarDeclStmt();
      else { init = { type: 'ExprStmt', expr: parseExpr() }; eat(TT.SEMI); }
    } else eat(TT.SEMI);
    let cond = null; if (!check(TT.SEMI)) cond = parseExpr(); eat(TT.SEMI);
    let upd  = null; if (!check(TT.RPAREN)) upd = parseExpr(); eat(TT.RPAREN);
    const body = parseStmt();
    return { type: 'For', init, cond, upd, body };
  }

  function parseReturn() {
    eat(TT.RETURN);
    let val = null;
    if (!check(TT.SEMI)) val = parseExpr();
    eat(TT.SEMI);
    return { type: 'Return', val };
  }

  function parseSwitch() {
    eat(TT.SWITCH); eat(TT.LPAREN);
    const disc = parseExpr(); eat(TT.RPAREN); eat(TT.LBRACE);
    const cases = [];
    while (!check(TT.RBRACE)) {
      if (check(TT.CASE)) {
        eat(TT.CASE); const val = parseExpr(); eat(TT.COLON);
        const stmts = [];
        while (!check(TT.CASE) && !check(TT.DEFAULT) && !check(TT.RBRACE)) stmts.push(parseStmt());
        cases.push({ type: 'Case', val, stmts });
      } else if (check(TT.DEFAULT)) {
        eat(TT.DEFAULT); eat(TT.COLON);
        const stmts = [];
        while (!check(TT.CASE) && !check(TT.DEFAULT) && !check(TT.RBRACE)) stmts.push(parseStmt());
        cases.push({ type: 'Default', stmts });
      } else break;
    }
    eat(TT.RBRACE);
    return { type: 'Switch', disc, cases };
  }

  // ── EXPRESSIONS (precedence climbing) ──────────────────────

  function parseExpr()    { return parseComma(); }
  function parseComma() {
    let e = parseAssign();
    while (check(TT.COMMA)) { eat(); const r = parseAssign(); e = { type: 'Comma', left: e, right: r }; }
    return e;
  }
  function parseAssign() {
    const e = parseTernary();
    const ops = {
      [TT.ASSIGN]: '=', [TT.PLUS_ASSIGN]: '+=', [TT.MINUS_ASSIGN]: '-=',
      [TT.MUL_ASSIGN]: '*=', [TT.DIV_ASSIGN]: '/=', [TT.MOD_ASSIGN]: '%='
    };
    if (ops[peek().type]) { const op = eat().type; const r = parseAssign(); return { type: 'Assign', op: ops[op], left: e, right: r }; }
    return e;
  }
  function parseTernary() {
    const e = parseOr();
    if (match(TT.QUESTION)) { const t = parseAssign(); eat(TT.COLON); const f = parseAssign(); return { type: 'Ternary', cond: e, then: t, els: f }; }
    return e;
  }
  function parseOr()     { let e = parseAnd();    while (check(TT.OR))    { eat(); const r = parseAnd();    e = { type: 'BinOp', op: '||', left: e, right: r }; } return e; }
  function parseAnd()    { let e = parseBitOr();  while (check(TT.AND))   { eat(); const r = parseBitOr();  e = { type: 'BinOp', op: '&&', left: e, right: r }; } return e; }
  function parseBitOr()  { let e = parseBitXor(); while (check(TT.PIPE))  { eat(); const r = parseBitXor(); e = { type: 'BinOp', op: '|',  left: e, right: r }; } return e; }
  function parseBitXor() { let e = parseBitAnd(); while (check(TT.CARET)) { eat(); const r = parseBitAnd(); e = { type: 'BinOp', op: '^',  left: e, right: r }; } return e; }
  function parseBitAnd() { let e = parseEq();     while (check(TT.AMP))   { eat(); const r = parseEq();     e = { type: 'BinOp', op: '&',  left: e, right: r }; } return e; }
  function parseEq()     { let e = parseRel();    while (check(TT.EQ, TT.NEQ))   { const op = eat().type === 'EQ' ? '==' : '!='; const r = parseRel();   e = { type: 'BinOp', op, left: e, right: r }; } return e; }
  function parseRel()    { let e = parseShift();  while (check(TT.LT, TT.GT, TT.LTE, TT.GTE)) { const op = { LT:'<', GT:'>', LTE:'<=', GTE:'>=' }[eat().type]; const r = parseShift(); e = { type: 'BinOp', op, left: e, right: r }; } return e; }
  function parseShift()  { let e = parseAdd();    while (check(TT.LSHIFT, TT.RSHIFT)) { const op = eat().type === 'LSHIFT' ? '<<' : '>>'; const r = parseAdd();    e = { type: 'BinOp', op, left: e, right: r }; } return e; }
  function parseAdd()    { let e = parseMul();    while (check(TT.PLUS, TT.MINUS))    { const op = eat().type === 'PLUS' ? '+' : '-'; const r = parseMul();    e = { type: 'BinOp', op, left: e, right: r }; } return e; }
  function parseMul()    { let e = parseCast();   while (check(TT.STAR, TT.SLASH, TT.PERCENT)) { const op = { STAR:'*', SLASH:'/', PERCENT:'%' }[eat().type]; const r = parseCast(); e = { type: 'BinOp', op, left: e, right: r }; } return e; }

  function parseCast() {
    if (check(TT.LPAREN)) {
      const saved = pos;
      try {
        pos++;
        if (isTypeName() || check(TT.STRUCT)) {
          const t = parseType();
          if (check(TT.RPAREN)) { pos++; const e = parseCast(); return { type: 'Cast', castType: t, expr: e }; }
        }
      } catch (e) {}
      pos = saved;
    }
    return parseUnary();
  }

  function parseUnary() {
    if (check(TT.NOT))   { eat(); return { type: 'Unary', op: '!', expr: parseUnary() }; }
    if (check(TT.MINUS)) { eat(); return { type: 'Unary', op: '-', expr: parseUnary() }; }
    if (check(TT.PLUS))  { eat(); return parseUnary(); }
    if (check(TT.TILDE)) { eat(); return { type: 'Unary', op: '~', expr: parseUnary() }; }
    if (check(TT.AMP))   { eat(); return { type: 'Unary', op: '&', expr: parseUnary() }; }
    if (check(TT.STAR))  { eat(); return { type: 'Unary', op: '*', expr: parseUnary() }; }
    if (check(TT.INC))   { eat(); return { type: 'PreInc', op: '++', expr: parseUnary() }; }
    if (check(TT.DEC))   { eat(); return { type: 'PreInc', op: '--', expr: parseUnary() }; }
    if (check(TT.SIZEOF)) {
      eat();
      if (match(TT.LPAREN)) { if (isTypeName()) parseType(); else parseExpr(); eat(TT.RPAREN); }
      else parseUnary();
      return { type: 'Num', val: 4 };
    }
    return parsePostfix();
  }

  function parsePostfix() {
    let e = parsePrimary();
    for (;;) {
      if (check(TT.LBRACKET)) {
        eat(); const idx = parseExpr(); eat(TT.RBRACKET);
        e = { type: 'Index', obj: e, idx };
      } else if (check(TT.LPAREN)) {
        eat();
        const args = [];
        if (!check(TT.RPAREN)) do { args.push(parseAssign()); } while (match(TT.COMMA));
        eat(TT.RPAREN);
        e = { type: 'Call', callee: e, args };
      } else if (check(TT.DOT)) {
        eat(); const f = eat(TT.ID).val;
        e = { type: 'Member', obj: e, field: f };
      } else if (check(TT.ARROW)) {
        eat(); const f = eat(TT.ID).val;
        e = { type: 'PtrMember', obj: e, field: f };
      } else if (check(TT.INC)) {
        eat(); e = { type: 'PostInc', op: '++', expr: e };
      } else if (check(TT.DEC)) {
        eat(); e = { type: 'PostInc', op: '--', expr: e };
      } else break;
    }
    return e;
  }

  function parsePrimary() {
    if (check(TT.NUM))     { return { type: 'Num',   val: eat().val }; }
    if (check(TT.FNUM))    { return { type: 'Float', val: eat().val }; }
    if (check(TT.STR))     { return { type: 'Str',   val: eat().val }; }
    if (check(TT.CHAR))    { return { type: 'Char',  val: eat().val }; }
    if (check(TT.NULL_KW)) { eat(); return { type: 'Num', val: 0 }; }
    if (check(TT.ID))      { return { type: 'ID', name: eat().val }; }
    if (match(TT.LPAREN))  { const e = parseExpr(); eat(TT.RPAREN); return { type: 'Paren', expr: e }; }
    throw new Error(`Unexpected token: ${peek().type} '${peek().val || ''}'`);
  }

  return parseProgram();
}
