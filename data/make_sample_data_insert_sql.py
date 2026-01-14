import csv

class Data:
    def __init_(self, name, type, no):
        self.name = name
        self.type = type
        self.no = no

def proc_func(s :str):
  if s.find(':') != -1:
    if len(s.split(':')[0]) == 1:
       return '0'+s
    else:
       return s
  else:
    return s.replace('/', '-') \
              .replace('%', '')


with open('./sample_data.csv', newline='', encoding="utf-8") as csvfile:
    spamreader = csv.reader(csvfile, delimiter=',')
    i = 1
    for row in spamreader:
        row = list(map(proc_func, row))
        print(str(i)+':'+', '.join(row))
        i+=1