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
  implementationStatus: 'implemented' | 'pending'
  testStatus: 'passed' | 'pending'
  exclusionReason?: string
}

export const XIANGQI_2020_COVERAGE: RuleCoverageEntry[] = [
  ['long-check', '24.9, 25.1, 4.1.4', '第八章图6', '长将', '责任方变着；不变作负'],
  ['long-kill', '24.10, 25.3, 26.9.1', '第八章图7', '长杀', '责任方变着；不变作负'],
  ['check-kill', '24.13, 25.3, 26.9.1', '第八章图17', '一将一杀', '责任方变着；不变作负'],
  ['chase-rook', '24.11, 26.9.1', '第八章图9', '长捉车', '责任方变着；不变作负'],
  ['chase-unprotected', '24.15, 26.9.1', '第八章图4', '长捉无根子', '责任方变着；不变作负'],
  ['check-chase', '24.13, 26.9.1', '第八章图8', '一将一捉', '责任方变着；不变作负'],
  ['both-forbidden', '26.9.1-26.9.4', '第八章图25-28', '双方禁止着法', '按责任比较变着或作和'],
  ['joint-chase', '24.17, 26.9.2-26.9.3', '第八章图10-11', '联合捉', '与单方长捉比较责任'],
  ['protected-piece', '24.15-24.16, 26.5', '第八章图22-23', '有根/无根/假根', '按完整交换结果分类'],
  ['exchange-sacrifice-block', '24.4-24.8, 26.4', '第八章图20-21', '兑/献/拦/闲及多重作用', '从重裁处'],
  ['multi-effect', '26.4', '第八章图20', '多重作用', '杀重于捉，捉重于闲类作用'],
  ['pawn-general', '26.1, 26.7-26.8', '第八章图14-17、24', '兵卒/帅将特殊分类', '本身长捉允许，配合新捉另判'],
  ['exchange-value', '26.5-26.6', '第八章图22-24', '交换价值', '按净得子及强弱子判断'],
  ['both-allowed', '25.2', '第八章图5', '双方允许着法', '不变作和'],
].map(([id, ruleReference, sourceFigure, expectedClassification, expectedVerdict]) => ({
  id: id!,
  scope: 'in-scope' as const,
  ruleReference: ruleReference!,
  sourceFigure: sourceFigure!,
  expectedClassification: expectedClassification!,
  expectedVerdict: expectedVerdict!,
  implementationStatus: 'implemented' as const,
  testStatus: 'passed' as const,
}))
