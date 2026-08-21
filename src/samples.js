export const samples = [
  {
    name: 'English Starter', description: 'A small starter deck for English → Japanese practice.',
    cards: [
      ['achieve','達成する'],['approach','近づく／方法'],['benefit','利益／恩恵'],['challenge','挑戦／課題'],['consider','検討する'],['describe','説明する'],['environment','環境'],['improve','改善する'],['require','必要とする'],['solution','解決策']
    ].map(([front,back]) => ({ front, back }))
  },
  {
    name: 'World Capitals', description: 'Country → capital sample deck.',
    cards: [['Japan','Tokyo'],['France','Paris'],['Germany','Berlin'],['Canada','Ottawa'],['Brazil','Brasília'],['Australia','Canberra'],['Egypt','Cairo'],['Thailand','Bangkok'],['Kenya','Nairobi'],['Argentina','Buenos Aires']].map(([front,back]) => ({ front, back }))
  },
  {
    name: 'Elements', description: 'Element symbol → name sample deck.',
    cards: [['H','Hydrogen'],['He','Helium'],['Li','Lithium'],['C','Carbon'],['N','Nitrogen'],['O','Oxygen'],['Na','Sodium'],['Mg','Magnesium'],['Fe','Iron'],['Cu','Copper']].map(([front,back]) => ({ front, back }))
  }
];
