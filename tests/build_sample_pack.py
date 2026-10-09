"""Curated starter based on the TOC of a user-supplied book; original examples.
NOT a full transcription of the copyrighted textbook or every vocabulary item.
"""
import json,re,unicodedata,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
# 60 thematic units, with original illustrative sentences rather than copied exercises.
DATA={
1:("The family","People","mother|mãe|My mother lives near the coast.;uncle|tio|My uncle works in a hospital.;relatives|parentes|Most of my relatives live in Brazil.;cousin|primo ou prima|I visited my cousin last weekend."),
2:("Birth, marriage and death","People","birthday|aniversário|My birthday is in October.;get married|casar-se|They plan to get married next year.;be born|nascer|She was born in a small town.;funeral|funeral|The family attended the funeral."),
3:("Parts of the body","People",""),
4:("Clothes","People","trousers|calças|These trousers are too long.;scarf|cachecol|I wear a scarf on cold days.;jacket|jaqueta|He left his jacket at work.;put on|vestir ou colocar|Please put on your coat."),
5:("Describing people","People","tall|alto|My brother is tall.;slim|esbelto|She has a slim figure.;good-looking|bonito|He is a good-looking actor.;beard|barba|He has a short beard."),
6:("Health and illness","People","headache|dor de cabeça|I have a headache today.;heart attack|ataque cardíaco|He was treated after a heart attack.;exercise|exercício físico|Regular exercise helps me relax.;toothache|dor de dente|I have toothache and need a dentist."),
7:("Feelings","People","tired|cansado|I feel tired after work.;thirsty|com sede|I am thirsty after my run.;upset|chateado|She was upset about the delay.;prefer|preferir|I prefer tea to coffee."),
8:("Conversations 1: Greetings and wishes","People","good morning|bom dia|Good morning, everyone.;well done|muito bem|Well done on your presentation!;congratulations|parabéns|Congratulations on your new job.;see you soon|até breve|See you soon at the office."),
9:("Conversations 2: Useful words and expressions","People","I don't mind|não me importo|I don't mind waiting a few minutes.;anyway|de qualquer forma|Anyway, let's finish the task.;let's|vamos|Let's review the results.;excuse me|com licença|Excuse me, is this seat free?"),
10:("Food and drink","At home","rice|arroz|We eat rice with vegetables.;tea|chá|Would you like some tea?;vegetables|legumes e verduras|I bought fresh vegetables.;bread|pão|There is some bread on the table."),
11:("In the kitchen","At home","fridge|geladeira|The milk is in the fridge.;saucepan|panela|Heat the soup in a saucepan.;knife|faca|Be careful with that knife.;glass|copo|Could you bring me a glass of water?"),
12:("In the bedroom and bathroom","At home","wardrobe|guarda-roupa|My clothes are in the wardrobe.;shampoo|xampu|I need to buy shampoo.;mirror|espelho|There is a mirror by the door.;towel|toalha|I forgot my towel."),
13:("In the living room","At home","bookshelf|estante de livros|The dictionary is on the bookshelf.;lamp|luminária|Switch on the reading lamp.;remote control|controle remoto|Where is the remote control?;sofa|sofá|We sat on the sofa."),
14:("Jobs","School and workplace","nurse|enfermeiro ou enfermeira|The nurse spoke to the patient.;factory|fábrica|My friend works in a factory.;secretary|secretário ou secretária|The secretary answered the phone.;engineer|engenheiro ou engenheira|The engineer checked the design."),
15:("At school and university","School and workplace","biology|biologia|She is studying biology.;notebook|caderno|Write the answer in your notebook.;pass an exam|passar em uma prova|He hopes to pass the exam.;degree|diploma universitário|She completed her degree last year."),
16:("Communications","School and workplace","address|endereço|Please check the email address.;computer|computador|My computer needs an update.;memory stick|pen drive|I saved the document on a memory stick.;message|mensagem|I sent you a message."),
17:("Your phone","School and workplace","app|aplicativo|I installed a new app.;voicemail|correio de voz|Please leave a voicemail.;text message|mensagem de texto|She sent a text message.;battery|bateria|My phone battery is low."),
18:("Holidays","Leisure","package holiday|pacote de viagem|We booked a package holiday.;currency|moeda|What currency do they use there?;visa|visto|I need a visa for my trip.;luggage|bagagem|My luggage is already packed."),
19:("Shops and shopping","Leisure","chemist's|farmácia|The chemist's is next to the bank.;department store|loja de departamentos|We went to a department store.;credit card|cartão de crédito|Can I pay by credit card?;receipt|recibo|Keep the receipt for your records."),
20:("Online shopping","Leisure","review|avaliação|I read a review before buying it.;basket|carrinho de compras|There are two items in my basket.;delivery|entrega|The delivery arrived today.;checkout|finalização de compra|Check the total at checkout."),
21:("In a hotel","Leisure","single room|quarto individual|I'd like a single room.;key|chave|Here is your room key.;luggage|bagagem|May I leave my luggage here?;reception|recepção|Ask at reception for help."),
22:("Eating out","Leisure","menu|cardápio|May I see the menu, please?;waiter|garçom|The waiter brought our drinks.;bill|conta|Could we have the bill, please?;fish and chips|peixe com batatas fritas|They ordered fish and chips."),
23:("Sports","Leisure","volleyball|vôlei|We play volleyball on Sundays.;judo|judô|My cousin practises judo.;table tennis|tênis de mesa|He enjoys table tennis.;swimming|natação|Swimming is my favourite sport."),
24:("Cinema","Leisure","director|diretor de cinema|The director introduced the film.;film star|astro de cinema|The film star answered questions.;western|filme de faroeste|My father likes westerns.;screen|tela|The film started on the big screen."),
25:("Free time at home","Leisure","gardening|jardinagem|Gardening helps me relax.;programme|programa|That programme starts at eight.;hobby|passatempo|Cooking is one of my hobbies.;listen to music|ouvir música|I listen to music after work."),
26:("Music and musical instruments","Leisure","guitar|violão ou guitarra|She plays the guitar.;jazz|jazz|We listened to jazz yesterday.;orchestra|orquestra|The orchestra played beautifully.;piano|piano|He is learning the piano."),
27:("Countries and nationalities","The world","country|país|Which country are you from?;Chinese|chinês|She is learning Chinese.;continent|continente|Africa is a continent.;nationality|nacionalidade|What is your nationality?"),
28:("Weather","The world","storm|tempestade|A storm is coming tonight.;rain|chuva|We had heavy rain yesterday.;cold|frio|It's very cold outside.;cloudy|nublado|It looks cloudy today."),
29:("In the town","The world","railway station|estação ferroviária|The railway station is nearby.;town hall|prefeitura|The meeting is at the town hall.;bank|banco|The bank closes at five.;traffic lights|semáforo|Turn left at the traffic lights."),
30:("In the countryside","The world","hill|colina|We walked up the hill.;farm|fazenda|They live on a farm.;river|rio|The river runs through the village.;field|campo|The horses were in the field."),
31:("Animals","The world","giraffe|girafa|The giraffe has a long neck.;horse|cavalo|The horse is running.;pet|animal de estimação|They have a pet cat.;rabbit|coelho|A rabbit crossed the road."),
32:("Travelling","The world","train|trem|I travel by train.;flight|voo|Our flight leaves early.;map|mapa|Look at the map before we go.;platform|plataforma|The train leaves from platform four."),
33:("UK culture","The world","fireworks|fogos de artifício|We watched the fireworks.;roast beef|carne bovina assada|They served roast beef for lunch.;Christmas|Natal|They visit family at Christmas.;tradition|tradição|It's a family tradition."),
34:("Crime","Social issues","murder|assassinato|The police investigated the murder.;prison|prisão|The criminal went to prison.;guilty|culpado|The court found him guilty.;steal|roubar ou furtar|Someone tried to steal my bicycle."),
35:("The media","Social issues","TV channel|canal de televisão|Change the TV channel, please.;magazine|revista|I read an interesting magazine.;talk show|programa de entrevistas|They discussed the news on a talk show.;newspaper|jornal|The newspaper arrived this morning."),
36:("Problems at home and work","Social issues","repair|consertar|Can you repair my computer?;untidy|bagunçado|The office is untidy.;in a bad mood|de mau humor|He's in a bad mood today.;out of order|fora de serviço|The lift is out of order."),
37:("Global problems","Social issues","hurricane|furacão|The hurricane damaged many houses.;war|guerra|The war displaced many families.;strike|greve|The workers began a strike.;pollution|poluição|Air pollution affects the city."),
38:("Have / had / had","Everyday verbs","have breakfast|tomar café da manhã|I have breakfast at seven.;have time|ter tempo|Do you have time to talk?;have a swim|dar uma nadada|Let's have a swim.;have a rest|descansar um pouco|You should have a rest."),
39:("Go / went / gone","Everyday verbs","go away|ir embora|Please don't go away yet.;go shopping|ir às compras|We go shopping on Saturday.;go home|ir para casa|I usually go home at six.;go for a walk|dar uma caminhada|Let's go for a walk."),
40:("Do / did / done","Everyday verbs","do an exercise|fazer um exercício|Do an exercise after each lesson.;do your best|dar o melhor de si|Just do your best.;do the washing|lavar a roupa|I do the washing on Sundays.;do homework|fazer o dever de casa|The children do homework after school."),
41:("Make / made / made","Everyday verbs","make coffee|preparar café|I'll make coffee for everyone.;make a mistake|cometer um erro|It's okay to make a mistake.;make a noise|fazer barulho|Please don't make a noise.;make a decision|tomar uma decisão|We need to make a decision."),
42:("Come / came / come","Everyday verbs","come in|entrar|Please come in.;come from|vir de|Where do you come from?;come back|voltar|When will you come back?;come along|vir junto|Would you like to come along?"),
43:("Take / took / taken","Everyday verbs","take the bus|pegar o ônibus|I take the bus to work.;take a photo|tirar uma foto|Can you take a photo of us?;take an exam|fazer uma prova|I'll take an exam tomorrow.;take a break|fazer uma pausa|Let's take a break."),
44:("Bring / brought / brought","Everyday verbs","bring back|trazer de volta|Please bring back my book.;bring something|trazer algo|Could you bring something to drink?;bring along|trazer junto|Bring along your notes.;bring home|trazer para casa|He'll bring home the documents."),
45:("Get / got / got","Everyday verbs","get tired|ficar cansado|I get tired after a long day.;get better|melhorar|I hope you get better soon.;get married|casar-se|They will get married in June.;get ready|preparar-se|We need to get ready."),
46:("Phrasal verbs","Everyday verbs","get up|levantar-se|I get up early.;put on|vestir ou colocar|Put on your jacket.;turn down|abaixar ou recusar|Please turn down the music.;look for|procurar|I'm looking for my keys."),
47:("Everyday things","Everyday verbs","watch TV|assistir TV|We watch TV after dinner.;wash clothes|lavar roupas|I wash clothes every weekend.;go for a walk|sair para caminhar|We go for a walk every evening.;have a shower|tomar banho de chuveiro|I have a shower in the morning."),
48:("Talking","Everyday verbs","say|dizer|What did she say?;tell|contar ou dizer a alguém|Please tell me the truth.;ask|perguntar|Can I ask a question?;speak|falar|She speaks three languages."),
49:("Moving","Everyday verbs","walk|caminhar|I walk to the office.;drive|dirigir|Can you drive a car?;fly|voar|Birds can fly.;run|correr|He runs every morning."),
50:("Conjunctions and connecting words","Words and grammar","because|porque|I stayed home because I was tired.;before|antes|Call me before the meeting.;although|embora|Although it was late, we continued.;however|no entanto|The first test failed. However, the second worked."),
51:("Days, months, seasons","Words and grammar","Monday|segunda-feira|We meet on Monday.;July|julho|It's usually hot here in July.;winter|inverno|Winter is my favourite season.;spring|primavera|Flowers appear in spring."),
52:("Time words","Words and grammar","next year|ano que vem|I'm moving next year.;often|frequentemente|I often read before bed.;once a week|uma vez por semana|I swim once a week.;yesterday|ontem|I called her yesterday."),
53:("Places","Words and grammar","middle|meio|The park is in the middle of town.;front|frente|Please sit in the front.;abroad|no exterior|She works abroad.;behind|atrás|The bus stop is behind the station."),
54:("Manner","Words and grammar","fast|rápido|He speaks too fast.;loud|alto em volume|The music is loud.;carefully|com cuidado|Read the instructions carefully.;the right way|da maneira correta|Show me the right way to do it."),
55:("Common uncountable nouns","Words and grammar","information|informação|I need some information.;bread|pão|We bought some bread.;advice|conselho|Can you give me some advice?;money|dinheiro|She saved some money."),
56:("Common adjectives: Good and bad things","Words and grammar","nice|agradável|We had a nice evening.;awful|horrível|The weather was awful.;lovely|adorável|That's a lovely photo.;excellent|excelente|You did an excellent job."),
57:("Words and prepositions","Words and grammar","wait for|esperar por|I will wait for you.;belong to|pertencer a|This book belongs to my sister.;good at|bom em|She is good at maths.;interested in|interessado em|I'm interested in learning English."),
58:("Prefixes","Words and grammar","impossible|impossível|This task is not impossible.;unsafe|inseguro|That road is unsafe at night.;unhappy|infeliz|He was unhappy with the result.;rewrite|reescrever|Please rewrite this paragraph."),
59:("Suffixes","Words and grammar","swimmer|nadador ou nadadora|She is a strong swimmer.;useless|inútil|The old cable is useless.;sunny|ensolarado|It's a sunny day.;careful|cuidadoso|Be careful when you cross the road."),
60:("Words you may confuse","Words and grammar","quiet|silencioso|Please be quiet during the test.;quite|bastante|This exercise is quite difficult.;borrow|pegar emprestado|Can I borrow your pen?;lend|emprestar|Could you lend me your pen?"),
}
def slug(s):
 s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode('ascii').lower()
 return re.sub('-+','-',re.sub('[^a-z0-9]+','-',s)).strip('-') or 'item'
assert set(DATA)==set(range(1,61))
unit3=json.loads((ROOT/'data/unit-03.json').read_text(encoding='utf8'))
units=[]
for n,(title,group,data) in DATA.items():
 if n==3:
  items=[{k:v for k,v in it.items() if k in ('id','word','pt','ipa','section','example','note','audio')} for it in unit3['items']]
 else:
  items=[]
  for pair in data.split(';'):
   word,pt,example=pair.split('|')
   items.append({'id':slug(word),'word':word,'pt':pt,'ipa':'','section':group,'example':example,'note':'','audio':''})
 units.append({'id':f'evie-3ed-u{n:02d}','title':f'Unit {n:02d} — {title}','level':'A1–A2','source':'English Vocabulary in Use Elementary, 3rd edition (2017); original learning examples','number':n,'bookId':'english-vocabulary-in-use-elementary-3ed','bookTitle':'English Vocabulary in Use — Elementary (3rd edition)','category':group,'sourcePage':2*n+7,'coverage':'starter-curated-partial','items':items})
package={'format':'vocablab-content-package','version':1,'id':'evie-elementary-3ed-starter','title':'English Vocabulary in Use — Elementary (60-unit starter)','publisher':'Cambridge University Press','bookId':'english-vocabulary-in-use-elementary-3ed','level':'A1–A2','description':'Pacote INICIAL (não transcrição integral): 60 unidades catalogadas; vocabulário ilustrativo selecionado, com exemplos originais. Unidade 3 contém 28 entradas. Amplie e revise antes de estudar. Sem áudio MP3 incluído.','coverage':'partial','sourceNotice':'Baseado em temas e vocabulário do livro enviado pelo usuário. Exemplos elaborados para esta ferramenta. Sem reprodução integral de exercícios, imagens ou áudio do livro.','units':units}
path=ROOT/'packages/english-vocabulary-in-use-elementary-starter.json'
path.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(len(units),'units',sum(len(u['items']) for u in units),'items',path.stat().st_size,'bytes')
