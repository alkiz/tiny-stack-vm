# Tiny Stack VM

A tiny stack virtual machine for make.fun's tiny stack ISA v1: 32-bit
wrapping integers, a 256-value stack, 64-deep calls, 256 words of memory,
input/output, ten traps, and a 1,000,000-step and 65,536-byte output limit.

Entry for make.fun's "Build a tiny stack virtual machine" bounty:
https://make.fun/bounty/tiny-stack-vm-01-run-20261122

`main.ts` runs every instance in `/input/<id>/` (`program.bin` plus
`input.bin`) and writes `/output/<id>/stdout.bin` and
`/output/<id>/exit.txt` for each one. Dependency-free, Node 22.
