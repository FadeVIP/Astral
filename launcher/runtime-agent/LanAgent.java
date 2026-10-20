package astral.runtime;

import java.lang.instrument.*;
import java.security.ProtectionDomain;
import jdk.internal.org.objectweb.asm.*;

/** Launcher-only compatibility for integrated 1.20.1 worlds. */
public final class LanAgent {
    public static void premain(String options, Instrumentation instrumentation) {
        instrumentation.addTransformer(new ClassFileTransformer() {
            public byte[] transform(ClassLoader loader, String name, Class<?> type, ProtectionDomain domain, byte[] original) {
                if (!"net/minecraft/client/server/IntegratedServer".equals(name)) return null;
                try {
                    ClassReader reader = new ClassReader(original);
                    ClassWriter writer = new ClassWriter(0);
                    int[] changed = {0};
                    reader.accept(new ClassVisitor(Opcodes.ASM8, writer) {
                        public MethodVisitor visitMethod(int access, String method, String desc, String signature, String[] exceptions) {
                            MethodVisitor mv = super.visitMethod(access, method, desc, signature, exceptions);
                            if (!"()Z".equals(desc) || !("m_7038_".equals(method) || "initServer".equals(method))) return mv;
                            return new MethodVisitor(Opcodes.ASM8, mv) {
                                public void visitMethodInsn(int opcode, String owner, String method, String desc, boolean itf) {
                                    if ((owner.equals(name) || owner.equals("net/minecraft/server/MinecraftServer")) &&
                                        (method.equals("m_129985_") || method.equals("setUsesAuthentication")) && desc.equals("(Z)V")) {
                                        super.visitInsn(Opcodes.POP);
                                        super.visitInsn(Opcodes.ICONST_0);
                                        changed[0]++;
                                    }
                                    super.visitMethodInsn(opcode, owner, method, desc, itf);
                                }
                            };
                        }
                    }, 0);
                    if (changed[0] != 1) throw new IllegalStateException("Unsupported integrated server: " + changed[0]);
                    System.out.println("[Astral LAN] Integrated world supports local profiles. Dedicated servers unchanged.");
                    return writer.toByteArray();
                } catch (Throwable error) {
                    System.err.println("[Astral LAN] Compatibility not applied: " + error);
                    return null;
                }
            }
        });
    }
}
