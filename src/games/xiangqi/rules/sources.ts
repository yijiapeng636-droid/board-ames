export const XIANGQI_2020_RULE_SOURCE = {
  title: '《象棋竞赛规则（2020版）》',
  authority: '中国象棋协会审定',
  confirmedByProject: true,
  confirmedAt: '2026-08-17',
  indexUrl: 'https://cnchess.net/rules/rules2020.html',
  terminologyUrl: 'https://cnchess.net/rules/ChapterSixSection24.html',
  principlesUrl: 'https://cnchess.net/rules/ChapterSixSection25.html',
  adjudicationUrl: 'https://cnchess.net/rules/ChapterSixSection26.html',
  examplesUrl: 'https://cnchess.net/rules/ChaptEight.html',
  referenceExamplesUrl: 'https://cnchess.net/rules/ChaptNine.html',
} as const

export interface RuleCoverageEntry {
  id: string
  scope: 'in-scope' | 'out-of-scope'
  ruleReference: string
  sourceFigure: string
  expectedClassification: string
  expectedVerdict: string
  requiredCaseIds: string[]
  exclusionReason?: string
}

const COVERAGE_ROWS: Array<[string, string, string, string, string, string[]]> = [
  ['long-check', '24.9, 25.1, 4.1.4', '第八章图6', '单方面长将', '直接判责任方作负', ['chapter08-figure06']],
  ['long-kill', '24.10, 25.3, 26.9.1', '第八章图7', '长杀', '责任方变着；不变作负', ['chapter08-figure07']],
  ['check-kill', '24.13, 25.3, 26.9.1', '第八章图17', '一将一杀', '责任方变着；不变作负', ['chapter08-figure17']],
  ['chase-rook', '24.11, 26.9.1', '第八章图2、3、9', '长捉车', '依双方着法责任变着或作和', ['chapter08-figure02', 'chapter08-figure03', 'chapter08-figure09']],
  ['chase-unprotected', '24.15, 26.9.1', '第八章图3-4', '长捉无根子', '依双方着法责任变着或作和', ['chapter08-figure03', 'chapter08-figure04']],
  ['check-chase', '24.13, 26.9.1', '第八章图8', '一将一捉', '责任方变着；不变作负', ['chapter08-figure08']],
  ['both-forbidden', '26.9.1-26.9.4', '第八章图25-28', '双方禁止着法', '按责任比较变着或作和', ['chapter08-figure25', 'chapter08-figure26', 'chapter08-figure27', 'chapter08-figure28']],
  ['joint-chase', '24.17, 26.9.2-26.9.3', '第八章图10-11', '联合捉', '与单方长捉比较责任', ['chapter08-figure10', 'chapter08-figure11']],
  ['protected-piece', '24.15-24.16, 26.5', '第八章图22-23', '有根/无根/假根', '按完整交换结果分类', ['chapter08-figure22', 'chapter08-figure23']],
  ['exchange-sacrifice-block', '24.4-24.8, 26.4', '第八章图2、7、9、20-21', '兑/献/拦/闲及多重作用', '从重裁处', ['chapter08-figure02', 'chapter08-figure07', 'chapter08-figure09', 'chapter08-figure20', 'chapter08-figure21']],
  ['multi-effect', '26.4', '第八章图20', '多重作用', '杀重于捉，捉重于闲类作用', ['chapter08-figure20']],
  ['pawn-general', '26.1, 26.7-26.8', '第八章图14-17、24', '兵卒/帅将特殊分类', '本身长捉允许，配合新捉另判', ['chapter08-figure14', 'chapter08-figure15', 'chapter08-figure16', 'chapter08-figure17', 'chapter08-figure24']],
  ['exchange-value', '26.5-26.6', '第八章图22-24', '交换价值', '按净得子及强弱子判断', ['chapter08-figure22', 'chapter08-figure23', 'chapter08-figure24']],
  ['both-allowed', '25.2', '第八章图5', '双方允许着法', '不变作和', ['chapter08-figure05']],
]

export const XIANGQI_2020_COVERAGE: RuleCoverageEntry[] = COVERAGE_ROWS.map(([id, ruleReference, sourceFigure, expectedClassification, expectedVerdict, requiredCaseIds]) => ({
  id: id!,
  scope: 'in-scope' as const,
  ruleReference: ruleReference!,
  sourceFigure: sourceFigure!,
  expectedClassification: expectedClassification!,
  expectedVerdict: expectedVerdict!,
  requiredCaseIds: requiredCaseIds!,
}))
